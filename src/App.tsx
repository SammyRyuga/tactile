import { useEffect, useReducer, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { MotionProps } from "motion/react";
import { z } from "zod";
import { ThemeToggle } from "./Theme.tsx";
import { ReviewTrail } from "./ReviewTrail.tsx";
import type { FormEvent } from "react";
import {
  demoClaims,
  demoExamples,
  demoProposal,
  runDemo,
} from "../shared/demo.ts";
import {
  claimSchema,
  reportSchema,
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
const defaultExample = {
  title: "Replace full test runs on pull requests with changed-package tests",
  proposal: demoProposal,
  claims: demoClaims,
};
type Progress = Partial<
  Record<ProgressEvent["stage"], ProgressEvent["status"]>
>;
type Workflow =
  | { page: "decision" | "claims" }
  | { page: "running"; progress: Progress }
  | { page: "report"; report: Report; previewProposal?: string };

type WorkflowAction =
  | { type: "decision" | "claims" | "start" }
  | ProgressEvent
  | { type: "report"; report: Report }
  | { type: "preview"; report: Report; proposal: string };

function reviewWorkflow(state: Workflow, action: WorkflowAction): Workflow {
  switch (action.type) {
    case "decision":
    case "claims":
      return { page: action.type };
    case "start":
      return { page: "running", progress: {} };
    case "progress":
      return state.page === "running"
        ? {
            ...state,
            progress: { ...state.progress, [action.stage]: action.status },
          }
        : state;
    case "preview":
      return {
        page: "report",
        report: action.report,
        previewProposal: action.proposal,
      };
    case "report":
      return state.page === "running"
        ? { page: "report", report: action.report }
        : state;
  }
}
type ClaimDraft = Claim & { selected: boolean };

function mark(
  icon:
    | "logo"
    | "arrow"
    | "external"
    | "download"
    | "plus"
    | "remove"
    | "chevron",
) {
  const paths = {
    logo: "M3 18h5v-5h5V8h5V3h3",
    arrow: "M4 12h15m-6-6 6 6-6 6",
    external: "M14 4h6v6m0-6-9 9m7 0v6H5V6h6",
    download: "M12 3v12m-5-5 5 5 5-5M5 17v3h14v-3",
    plus: "M12 5v14M5 12h14",
    remove: "M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5",
    chevron: "m6 9 6 6 6-6",
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
    new Blob([toMarkdown(proposal, report, window.location.origin)], {
      type: "text/markdown;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "tactile-review.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const savedDraftSchema = z
  .object({
    page: z.enum(["decision", "claims", "report"]),
    proposal: z.string().max(limits.proposal),
    claims: z
      .array(
        claimSchema.extend({
          text: z.string().max(limits.claim),
          selected: z.boolean(),
        }),
      )
      .max(limits.claims),
    mode: z.enum(["demo", "live"]),
    report: reportSchema.optional(),
  })
  .refine(({ page, report }) => page !== "report" || Boolean(report));

const recentSchema = z
  .array(
    z.object({
      id: z.string(),
      savedAt: z.string(),
      proposal: z.string().max(limits.proposal),
      report: reportSchema,
    }),
  )
  .max(5);
type Recent = z.infer<typeof recentSchema>[number];

function readRecent(key: string): Recent[] {
  try {
    const result = recentSchema.safeParse(
      JSON.parse(sessionStorage.getItem(key) ?? "[]"),
    );
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function readDraft(key: string) {
  try {
    const result = savedDraftSchema.safeParse(
      JSON.parse(sessionStorage.getItem(key) ?? "null"),
    );
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function App({
  token,
  account,
  accountId,
  signOut,
  startExample,
  initialExample,
}: {
  token?: string;
  account?: string;
  accountId?: string;
  startExample: boolean;
  initialExample?: {
    id?: string;
    title?: string;
    proposal: string;
    claims: Claim[];
  };
  signOut?: () => Promise<void>;
}) {
  const example = initialExample ?? defaultExample;
  const scenarioId = initialExample?.id;
  const locationKey = startExample
    ? scenarioId
      ? `example:${scenarioId}`
      : "example"
    : "workspace";
  const storageKey = `tactile-review-v1:${accountId ?? "guest"}:${locationKey}`;
  const recentKey = `tactile-review-v1:${accountId ?? "guest"}:recent`;
  const [recent, setRecent] = useState(() => readRecent(recentKey));
  const [copyStatus, setCopyStatus] = useState("");
  const reduceMotion = useReducedMotion();
  const enter: MotionProps = {
    initial: reduceMotion ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  };
  const [saved] = useState(() => readDraft(storageKey));
  const [state, dispatch] = useReducer(
    reviewWorkflow,
    undefined,
    (): Workflow =>
      saved?.page === "report" && saved.report
        ? { page: "report", report: saved.report }
        : {
            page:
              saved?.page === "claims" || (!saved && startExample)
                ? "claims"
                : "decision",
          },
  );
  const { page } = state;
  const report = page === "report" ? state.report : undefined;
  const progress = page === "running" ? state.progress : undefined;
  const previewProposal = page === "report" ? state.previewProposal : undefined;
  const [proposal, setProposal] = useState(
    saved?.proposal ?? (startExample ? example.proposal : ""),
  );
  const reportProposal = previewProposal ?? proposal;
  const [claims, setClaims] = useState<ClaimDraft[]>(
    () => saved?.claims ?? (startExample ? seedDraft(example.claims) : []),
  );
  const [mode, setMode] = useState<"demo" | "live">(saved?.mode ?? "demo");
  const [availability, setAvailability] = useState<
    "checking" | "live" | "demo"
  >("checking");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const proposalField = useRef<HTMLTextAreaElement>(null);
  const previousPage = useRef<Workflow["page"]>("decision");
  const selected = claims.filter((claim) => claim.selected);
  const current = page === "decision" ? 0 : page === "claims" ? 1 : 2;

  useEffect(() => {
    if (previewProposal !== undefined) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          page: page === "running" ? "claims" : page,
          proposal,
          claims,
          mode,
          report,
        }),
      );
    } catch {
      // The review remains usable when browser storage is unavailable.
    }
  }, [storageKey, page, proposal, claims, mode, report, previewProposal]);

  useEffect(() => {
    try {
      sessionStorage.setItem(recentKey, JSON.stringify(recent));
    } catch {
      // Browser storage can be unavailable.
    }
  }, [recentKey, recent]);

  useEffect(() => {
    const controller = new AbortController();
    liveAvailable(controller.signal, token).then(
      (live) => {
        if (!controller.signal.aborted) setAvailability(live ? "live" : "demo");
      },
      () => {
        if (!controller.signal.aborted) setAvailability("demo");
      },
    );
    return () => {
      controller.abort();
    };
  }, [token]);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (previousPage.current !== page) {
      previousPage.current = page;
      heading.current?.focus();
    }
  }, [page]);

  function openDemo() {
    setProposal(example.proposal);
    setClaims(seedDraft(example.claims));
    setMode("demo");
    setError("");
    dispatch({ type: "claims" });
  }

  async function onExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = proposalSchema.safeParse(proposal);
    if (!parsed.success) {
      setError("Describe your decision in at least 20 characters.");
      proposalField.current?.focus();
      return;
    }
    if (proposal.trim() === example.proposal && availability !== "live") {
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
      dispatch({ type: "claims" });
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
    change: Partial<
      Pick<ClaimDraft, "text" | "selected" | "risk" | "loadBearing">
    >,
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
    setError("");
    setCopyStatus("");
    dispatch({ type: "start" });
    const emit = (event: ReviewEvent) => {
      if (controller.signal.aborted || event.type === "error") return;
      if (event.type === "report") {
        const record = {
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          proposal: input.data.proposal,
          report: event.report,
        };
        setRecent((history) => [record, ...history].slice(0, 5));
      }
      dispatch(event);
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
        dispatch({ type: "claims" });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function cancelReview() {
    request.current?.abort();
    request.current = null;
    setError("");
    dispatch({ type: "claims" });
  }

  function reopen(entry: Recent) {
    setCopyStatus("");
    setError("");
    dispatch({
      type: "preview",
      report: entry.report,
      proposal: entry.proposal,
    });
  }

  async function copyReport(currentReport: Report) {
    try {
      await navigator.clipboard.writeText(
        toMarkdown(reportProposal, currentReport, window.location.origin),
      );
      setCopyStatus("Report copied.");
    } catch {
      setCopyStatus(
        "Clipboard unavailable. Use Export Markdown to save the report.",
      );
    }
  }

  function restart() {
    setCopyStatus("");
    dispatch({ type: "decision" });
    setProposal("");
    setClaims([]);
    setError("");
  }

  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="topbar review-topbar">
        <div className="topbar-body">
          <a className="wordmark" href="/" aria-label="Tactile home">
            <span className="logo">{mark("logo")}</span>Tactile
          </a>
          <nav aria-label="Project links">
            <a href="/">Home</a>
            <a href="/settings">Settings</a>
            <ThemeToggle />
            <a href="https://github.com/SammyRyuga/tactile">
              GitHub {mark("external")}
            </a>
          </nav>
        </div>
      </header>

      <main
        id="content"
        className="workspace review-workspace"
        data-page={page}
      >
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
        <div className="review-masthead">
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
        </div>

        {page === "decision" && (
          <motion.div key="decision" className="decision-layout" {...enter}>
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
                  proposal.trim() !== example.proposal && (
                    <p className="field-note">
                      Live reviews need a provider key in{" "}
                      <a href="/settings">Settings</a>.
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
                        proposal.trim() !== example.proposal)
                    }
                  >
                    {extracting ? "Extracting claims…" : "Extract claims"}
                  </button>
                </div>
              </form>
            </section>
            <aside className="workspace-sidebar">
              <section className="panel example">
                <h2>Example library</h2>
                <p>
                  Try a proposal and review its claims with bundled evidence.
                </p>
                <ul className="workspace-list">
                  {demoExamples.map((item) => (
                    <li key={item.id}>
                      <a href={`/review?example=${item.id}`}>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.title}</small>
                        </span>
                        {mark("arrow")}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
              {recent.length > 0 && (
                <section
                  className="panel example"
                  aria-labelledby="recent-reports-title"
                >
                  <h2 id="recent-reports-title">Recent reports</h2>
                  <p>Available in this tab for your current session.</p>
                  <ul className="workspace-list">
                    {recent.map((entry) => (
                      <li key={entry.id}>
                        <button type="button" onClick={() => reopen(entry)}>
                          <span>
                            <strong>
                              {entry.proposal.split("\n")[0].slice(0, 85)}
                            </strong>
                            <small>
                              {new Date(entry.savedAt).toLocaleDateString()} ·{" "}
                              {entry.report.mode === "live"
                                ? "Live review"
                                : "Bundled example"}
                            </small>
                          </span>
                          {mark("arrow")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </motion.div>
        )}

        {page === "claims" && (
          <motion.section
            key="claims"
            className="panel claim-editor"
            {...enter}
          >
            <div className="claim-editor-head">
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  Confirm the claims
                </h2>
                <p>
                  Edit the wording and choose up to {limits.selected} claims to
                  review.
                </p>
              </div>
              <div className="claim-count" role="status">
                <div className="claim-count-track" aria-hidden="true">
                  {Array.from({ length: limits.selected }, (_, index) => (
                    <span key={index} data-filled={index < selected.length} />
                  ))}
                </div>
                <span>
                  <strong>
                    {selected.length} of {limits.selected}
                  </strong>{" "}
                  selected
                </span>
              </div>
            </div>
            <details className="proposal claim-proposal">
              <summary>Read your proposal {mark("chevron")}</summary>
              <p>{proposal}</p>
            </details>
            <form onSubmit={onReview}>
              <div className="claim-list">
                {claims.map((claim, index) => (
                  <div
                    className="claim-row"
                    key={claim.id}
                    data-selected={claim.selected}
                  >
                    <div className="claim-row-head">
                      <label className="claim-name" htmlFor={claim.id}>
                        Claim {index + 1}
                      </label>
                      <div className="claim-row-actions">
                        <label
                          className="check-label claim-pick"
                          data-checked={claim.selected}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Review claim ${index + 1}`}
                            checked={claim.selected}
                            disabled={
                              !claim.selected &&
                              selected.length >= limits.selected
                            }
                            onChange={(event) =>
                              updateClaim(claim.id, {
                                selected: event.target.checked,
                              })
                            }
                          />
                          <span aria-hidden="true">
                            {claim.selected ? "Included" : "Include"}
                          </span>
                        </label>
                        <button
                          type="button"
                          className="claim-remove"
                          aria-label={`Remove claim ${index + 1}`}
                          title="Remove claim"
                          onClick={() => {
                            const next = claims[index + 1] ?? claims[index - 1];
                            setClaims((currentClaims) =>
                              currentClaims.filter(({ id }) => id !== claim.id),
                            );
                            requestAnimationFrame(() =>
                              document
                                .getElementById(next?.id ?? "add-claim")
                                ?.focus(),
                            );
                            setError("");
                          }}
                        >
                          {mark("remove")}
                        </button>
                      </div>
                    </div>
                    <textarea
                      id={claim.id}
                      value={claim.text}
                      rows={2}
                      placeholder="Write a testable claim"
                      maxLength={limits.claim}
                      onChange={(event) =>
                        updateClaim(claim.id, { text: event.target.value })
                      }
                    />
                    <div className="claim-meta">
                      <label>
                        Main risk
                        <select
                          aria-label={`Main risk for claim ${index + 1}`}
                          value={claim.risk ?? "logic"}
                          onChange={(event) => {
                            const result = claimSchema.shape.risk.safeParse(
                              event.target.value,
                            );
                            if (result.success)
                              updateClaim(claim.id, { risk: result.data });
                          }}
                        >
                          <option value="logic">Logic</option>
                          <option value="technical">
                            Technical feasibility
                          </option>
                          <option value="adoption">
                            Adoption and operations
                          </option>
                          <option value="evidence">Public evidence</option>
                        </select>
                      </label>
                      <label
                        className="check-label claim-priority"
                        data-checked={Boolean(claim.loadBearing)}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(claim.loadBearing)}
                          onChange={(event) =>
                            updateClaim(claim.id, {
                              loadBearing: event.target.checked,
                            })
                          }
                        />
                        <span>Load-bearing</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="actions split claim-editor-footer">
                <div className="actions">
                  <button
                    type="button"
                    className="button claim-add"
                    id="add-claim"
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
                    {mark("plus")} Add claim
                  </button>
                  <span className="claim-mode">
                    {mode === "demo" ? "Bundled example" : "Live review"}
                  </span>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      dispatch({ type: "decision" });
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
          </motion.section>
        )}

        {page === "running" && (
          <motion.section key="running" className="panel" {...enter}>
            <h2 ref={heading} tabIndex={-1}>
              Reviewing your claims
            </h2>
            <p className="section-note">
              {mode === "demo"
                ? "Bundled example · Reading local evidence"
                : "Live review · Checking the confirmed claims"}
            </p>
            <ul className="activity" aria-live="polite">
              {stages.map((stage) => (
                <li key={stage} data-status={progress?.[stage] ?? "waiting"}>
                  <strong>{stage}</strong>
                  <span>
                    {progress?.[stage] === "done"
                      ? "Complete"
                      : progress?.[stage] === "running"
                        ? "In progress"
                        : progress?.[stage] === "unavailable"
                          ? "Incomplete"
                          : progress?.[stage] === "skipped"
                            ? "Skipped"
                            : "Waiting"}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" className="button" onClick={cancelReview}>
              Cancel review
            </button>
          </motion.section>
        )}

        {page === "report" && report && (
          <motion.section key="report" className="panel report" {...enter}>
            <div className="split report-header">
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  Decision report
                </h2>
                <p className="section-note">
                  {report.mode === "demo"
                    ? "Bundled example evidence"
                    : "Live review"}
                </p>
              </div>
              <button
                type="button"
                className="button"
                onClick={() => exportReport(reportProposal, report)}
              >
                {mark("download")} Export Markdown
              </button>
            </div>
            <div className="actions report-tools">
              <button
                type="button"
                className="text-button"
                onClick={() => void copyReport(report)}
              >
                Copy Markdown
              </button>
              <span className="field-note" role="status">
                {copyStatus}
              </span>
            </div>
            <div className="recommendation">
              <h3>Recommended next step</h3>
              <p>{report.recommendation}</p>
            </div>
            <details className="proposal">
              <summary>Read your proposal</summary>
              <p>{reportProposal}</p>
            </details>
            <div className="findings">
              {report.findings.map((finding) => (
                <article key={finding.claim.id} className="finding">
                  <span className={`verdict ${finding.verdict.toLowerCase()}`}>
                    {finding.verdict}
                  </span>
                  {finding.basis && (
                    <span className="finding-basis">
                      {finding.basis === "proposal"
                        ? "Proposal reasoning"
                        : finding.basis === "arithmetic"
                          ? "Arithmetic check"
                          : "Verified source"}
                    </span>
                  )}
                  <h3>{finding.claim.text}</h3>
                  <p>{finding.rationale}</p>
                  <p>
                    <strong>Next step</strong> {finding.nextStep}
                  </p>
                  <ReviewTrail finding={finding} sources={report.sources} />
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
              {previewProposal !== undefined ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => dispatch({ type: "decision" })}
                >
                  Back to workspace
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="button"
                    onClick={() => dispatch({ type: "claims" })}
                  >
                    Edit claims
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={restart}
                  >
                    Start a new review
                  </button>
                </>
              )}
            </div>
          </motion.section>
        )}

        <footer>
          Built by <a href="https://github.com/ryanfer123">ryanfer123</a> and{" "}
          <a href="https://github.com/SammyRyuga">SammyRyuga</a>
        </footer>
      </main>
    </>
  );
}
