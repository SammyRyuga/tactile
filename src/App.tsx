import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { demoClaims, demoProposal, runDemo } from "../shared/demo.ts";
import {
  limits,
  proposalSchema,
  reviewInputSchema,
  stages,
  toMarkdown,
} from "../shared/review.ts";
import type {
  Claim,
  ProgressEvent,
  Report,
  ReviewEvent,
} from "../shared/review.ts";
import { extractLive, liveAvailable, runLive } from "./api.ts";

const stepLabels = ["Decision", "Claims", "Report"] as const;
type Page = "decision" | "claims" | "running" | "report";
type ClaimDraft = Claim & { selected: boolean };

function mark(icon: "logo" | "arrow" | "external" | "download") {
  const paths = {
    logo: "M3 18h5v-5h5V8h5V3h3",
    arrow: "M4 12h15m-6-6 6 6-6 6",
    external: "M14 4h6v6m0-6-9 9m7 0v6H5V6h6",
    download: "M12 3v12m-5-5 5 5 5-5M5 17v3h14v-3",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={icon === "logo" ? 2.7 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[icon]} />
    </svg>
  );
}

function seedDraft(claims: Claim[]): ClaimDraft[] {
  return claims.map((claim, index) => ({
    ...claim,
    selected: index < limits.selected,
  }));
}

function exportReport(proposal: string, report: Report) {
  const url = URL.createObjectURL(
    new Blob([toMarkdown(proposal, report)], {
      type: "text/markdown;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "tactile-review.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App({
  token,
  account,
  needsSignIn,
  signOut,
  startDemo,
}: {
  token?: string;
  account?: string;
  needsSignIn: boolean;
  startDemo: boolean;
  signOut?: () => Promise<void>;
}) {
  const [page, setPage] = useState<Page>(startDemo ? "claims" : "decision");
  const [proposal, setProposal] = useState(startDemo ? demoProposal : "");
  const [claims, setClaims] = useState<ClaimDraft[]>(() =>
    startDemo ? seedDraft(demoClaims) : [],
  );
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [availability, setAvailability] = useState<
    "checking" | "live" | "demo"
  >("checking");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<
    Partial<Record<ProgressEvent["stage"], ProgressEvent["status"]>>
  >({});
  const [report, setReport] = useState<Report>();
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const proposalField = useRef<HTMLTextAreaElement>(null);
  const previousPage = useRef<Page>("decision");
  const selected = claims.filter((claim) => claim.selected);
  const current = page === "decision" ? 0 : page === "claims" ? 1 : 2;

  useEffect(() => {
    const controller = new AbortController();
    liveAvailable(controller.signal).then(
      (live) => {
        if (!controller.signal.aborted)
          setAvailability(live && !needsSignIn ? "live" : "demo");
      },
      () => {
        if (!controller.signal.aborted) setAvailability("demo");
      },
    );
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [needsSignIn]);

  useEffect(() => {
    if (previousPage.current !== page) {
      previousPage.current = page;
      heading.current?.focus();
    }
  }, [page]);

  function openDemo() {
    setProposal(demoProposal);
    setClaims(seedDraft(demoClaims));
    setMode("demo");
    setError("");
    setPage("claims");
  }

  async function onExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = proposalSchema.safeParse(proposal);
    if (!parsed.success) {
      setError("Describe your decision in at least 20 characters.");
      proposalField.current?.focus();
      return;
    }
    if (proposal.trim() === demoProposal && availability !== "live") {
      openDemo();
      return;
    }
    if (availability !== "live" || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setExtracting(true);
    setError("");
    try {
      const result = await extractLive(parsed.data, controller.signal, token);
      if (controller.signal.aborted) return;
      setProposal(parsed.data);
      setClaims(seedDraft(result));
      setMode("live");
      setPage("claims");
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Claim extraction failed.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setExtracting(false);
      }
    }
  }

  function updateClaim(
    id: string,
    change: Partial<Pick<ClaimDraft, "text" | "selected">>,
  ) {
    setError("");
    setClaims((existing) =>
      existing.map((claim) =>
        claim.id === id ? { ...claim, ...change } : claim,
      ),
    );
  }

  async function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = reviewInputSchema.safeParse({ proposal, claims: selected });
    if (!input.success || selected.some((claim) => !claim.text.trim())) {
      setError(
        "Select one to three claims and give each one a short description.",
      );
      return;
    }
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setProgress({});
    setError("");
    setReport(undefined);
    setPage("running");
    const emit = (event: ReviewEvent) => {
      if (controller.signal.aborted) return;
      if (event.type === "progress") {
        setProgress((previous) => ({
          ...previous,
          [event.stage]: event.status,
        }));
      }
      if (event.type === "report") {
        setReport(event.report);
        setPage("report");
      }
    };

    try {
      await (mode === "demo" ? runDemo : runLive)(
        input.data,
        emit,
        controller.signal,
        token,
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The review could not finish. Try again.",
        );
        setPage("claims");
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function cancelReview() {
    request.current?.abort();
    request.current = null;
    setError("");
    setPage("claims");
  }

  function restart() {
    setPage("decision");
    setProposal("");
    setClaims([]);
    setReport(undefined);
    setError("");
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-body">
          <a className="wordmark" href="/" aria-label="Tactile home">
            <span className="logo">{mark("logo")}</span>Tactile
          </a>
          <nav aria-label="Project links">
            <a href="/">Home</a>
            {needsSignIn && <a href="/login">Sign in</a>}
            <a href="https://github.com/SammyRyuga/tactile">
              GitHub {mark("external")}
            </a>
          </nav>
        </div>
      </header>

      <main className="workspace">
        {account && (
          <div className="account-strip">
            <span>Signed in as {account}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => void signOut?.()}
            >
              Sign out
            </button>
          </div>
        )}
        <div className="intro">
          <h1>Review an engineering decision</h1>
          <p>
            Find the assumptions your proposal depends on before you commit.
          </p>
        </div>

        <ol className="steps" aria-label="Review steps">
          {stepLabels.map((step, index) => (
            <li
              key={step}
              aria-current={current === index ? "step" : undefined}
              className={index <= current ? "reached" : ""}
            >
              <span className="step-count" aria-hidden="true">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {page === "decision" && (
          <div className="decision-layout">
            <section className="panel">
              <h2 ref={heading} tabIndex={-1}>
                Describe your decision
              </h2>
              <form onSubmit={onExtract}>
                <label htmlFor="proposal">Engineering proposal</label>
                <textarea
                  ref={proposalField}
                  id="proposal"
                  value={proposal}
                  disabled={extracting}
                  maxLength={limits.proposal}
                  placeholder="Describe the change you’re considering, the current state, and the expected outcome. Include relevant context, constraints, or alternatives if helpful."
                  onChange={(event) => {
                    setProposal(event.target.value);
                    setError("");
                  }}
                />
                {availability === "demo" &&
                  proposal.trim() !== demoProposal && (
                    <p className="field-note">
                      {needsSignIn
                        ? "Sign in to access live reviews. The example is open to everyone."
                        : "Live reviews require a server-side provider key."}
                    </p>
                  )}
                {availability === "live" && (
                  <p className="field-note">
                    Live review sends your proposal to the configured provider.
                    Use only information you can share.
                  </p>
                )}
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <div className="actions">
                  <button
                    className="button primary"
                    type="submit"
                    disabled={
                      extracting ||
                      (availability !== "live" &&
                        proposal.trim() !== demoProposal)
                    }
                  >
                    {extracting ? "Extracting claims…" : "Extract claims"}
                  </button>
                  <button
                    className={
                      availability === "demo" &&
                      proposal.trim() !== demoProposal
                        ? "button primary"
                        : "button"
                    }
                    type="button"
                    disabled={extracting}
                    onClick={openDemo}
                  >
                    Try the demo {mark("arrow")}
                  </button>
                </div>
              </form>
            </section>
            <aside className="panel example">
              <h2>Try an example</h2>
              <p className="example-title">
                Replace full test runs on pull requests with changed-package
                tests
              </p>
              <p>
                Faster test feedback sounds good. What happens when a change
                breaks a package that depends on it?
              </p>
              <button
                className="button"
                type="button"
                disabled={extracting}
                onClick={() => {
                  setProposal(demoProposal);
                  setError("");
                  proposalField.current?.focus();
                }}
              >
                Load example
              </button>
            </aside>
          </div>
        )}

        {page === "claims" && (
          <section className="panel">
            <h2 ref={heading} tabIndex={-1}>
              Confirm the claims
            </h2>
            <p className="section-note">
              Edit any claim, then select up to three whose failure would change
              your decision.
            </p>
            <details className="proposal">
              <summary>Read your proposal</summary>
              <p>{proposal}</p>
            </details>
            <form onSubmit={onReview}>
              <div className="claim-list">
                {claims.map((claim, index) => (
                  <div className="claim-row" key={claim.id}>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={claim.selected}
                        disabled={
                          !claim.selected && selected.length >= limits.selected
                        }
                        onChange={(event) =>
                          updateClaim(claim.id, {
                            selected: event.target.checked,
                          })
                        }
                      />
                      <span>
                        Review
                        <span className="sr-only"> claim {index + 1}</span>
                      </span>
                    </label>
                    <label className="sr-only" htmlFor={claim.id}>
                      Claim {index + 1}
                    </label>
                    <textarea
                      id={claim.id}
                      value={claim.text}
                      rows={2}
                      maxLength={limits.claim}
                      onChange={(event) =>
                        updateClaim(claim.id, { text: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Remove claim ${index + 1}`}
                      onClick={() => {
                        setClaims((currentClaims) =>
                          currentClaims.filter(({ id }) => id !== claim.id),
                        );
                        setError("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="actions split">
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    disabled={claims.length >= limits.claims}
                    onClick={() => {
                      const id = crypto.randomUUID();
                      setClaims((existing) => [
                        ...existing,
                        { id, text: "", selected: false },
                      ]);
                      requestAnimationFrame(() =>
                        document.getElementById(id)?.focus(),
                      );
                      setError("");
                    }}
                  >
                    Add claim
                  </button>
                  <span className="field-note" role="status">
                    {selected.length} of {limits.selected} selected ·{" "}
                    {mode === "demo" ? "Bundled demo" : "Live review"}
                  </span>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPage("decision");
                      setError("");
                    }}
                  >
                    Back to decision
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!selected.length}
                  >
                    Run review {mark("arrow")}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {page === "running" && (
          <section className="panel">
            <h2 ref={heading} tabIndex={-1}>
              Reviewing your claims
            </h2>
            <p className="section-note">
              {mode === "demo"
                ? "Bundled demo · Reading local evidence"
                : "Live review · Checking the confirmed claims"}
            </p>
            <ul className="activity" aria-live="polite">
              {stages.map((stage) => (
                <li key={stage}>
                  <strong>{stage}</strong>
                  <span>
                    {progress[stage] === "done"
                      ? "Complete"
                      : progress[stage] === "running"
                        ? "In progress"
                        : progress[stage] === "unavailable"
                          ? "Incomplete"
                          : "Waiting"}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="button" onClick={cancelReview}>
              Cancel review
            </button>
          </section>
        )}

        {page === "report" && report && (
          <section className="panel report">
            <div className="split report-header">
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  Decision report
                </h2>
                <p className="section-note">
                  {report.mode === "demo"
                    ? "Bundled demo evidence"
                    : "Live review"}
                </p>
              </div>
              <button
                type="button"
                className="button"
                onClick={() => exportReport(proposal, report)}
              >
                {mark("download")} Export Markdown
              </button>
            </div>
            <div className="recommendation">
              <h3>Recommended next step</h3>
              <p>{report.recommendation}</p>
            </div>
            <details className="proposal">
              <summary>Read your proposal</summary>
              <p>{proposal}</p>
            </details>
            <div className="findings">
              {report.findings.map((finding) => (
                <article key={finding.claim.id} className="finding">
                  <span className={`verdict ${finding.verdict.toLowerCase()}`}>
                    {finding.verdict}
                  </span>
                  <h3>{finding.claim.text}</h3>
                  <p>{finding.rationale}</p>
                  <p>
                    <strong>Next step</strong> {finding.nextStep}
                  </p>
                  {finding.sourceIds.length > 0 && (
                    <ul className="sources" aria-label="Sources">
                      {report.sources
                        .filter(({ id }) => finding.sourceIds.includes(id))
                        .map((source) => (
                          <li key={source.id}>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.title} {mark("external")}
                            </a>
                          </li>
                        ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
            <div className="actions">
              <button
                type="button"
                className="button"
                onClick={() => setPage("claims")}
              >
                Edit claims
              </button>
              <button type="button" className="text-button" onClick={restart}>
                Start a new review
              </button>
            </div>
          </section>
        )}

        <footer>
          Built by <a href="https://github.com/ryanfer123">ryanfer123</a> and{" "}
          <a href="https://github.com/SammyRyuga">SammyRyuga</a>
        </footer>
      </main>
    </>
  );
}
