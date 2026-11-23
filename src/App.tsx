/// <reference types="vite/client" />

import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import type { MotionProps } from "motion/react";
import { z } from "zod";
import { ThemeToggle } from "./Theme.tsx";
import { ActionArrow } from "./ActionArrow.tsx";
import { TeamCredits } from "./TeamCredits.tsx";
import { ProposalAttachments } from "./ProposalAttachments.tsx";
import { ProposalRevision } from "./ProposalRevision.tsx";
import type { CheckDraft, EvidenceDraft } from "./EvidenceEditor.tsx";
import { ReviewSettings } from "./ReviewSettings.tsx";
import {
  downloadText,
  MeasurementArtifact,
  OutcomeLog,
} from "./ReviewExtras.tsx";
import { reviewModelSchema, reviewModels } from "../shared/models.ts";
import { engineeringCheckSchema } from "../shared/engineering.ts";
import {
  reviewerIds,
  reviewerByStage,
  reviewers,
  reviewersSchema,
  reviewerStageLabel,
} from "../shared/reviewers.ts";
import type { Reviewer } from "../shared/reviewers.ts";
import { ReviewTrail } from "./ReviewTrail.tsx";
import { LiveReviewRoom, RecordedReviewRoom } from "./ReviewRoom.tsx";
import { startControlRoomFeed } from "./controlRoomFeed.ts";
import type { FormEvent } from "react";
import {
  demoClaims,
  demoExamples,
  demoProposal,
  recordedConclusion,
  restoreDemoReport,
  runDemo,
} from "../shared/demo.ts";
import {
  claimSchema,
  decisionContextSchema,
  decisionMemoSections,
  projectEvidenceSchema,
  reportSchema,
  limits,
  proposalSchema,
  reviewInputSchema,
  stages,
  toMarkdown,
  uncheckedCriticalClaimsLabel,
  uniqueSourcesByUrl,
} from "../shared/review.ts";
import type {
  Claim,
  DecisionContext,
  Finding,
  ProgressEvent,
  Report,
  ReviewEvent,
} from "../shared/review.ts";
import {
  extractLive,
  IntakeClarification,
  liveAvailable,
  runLive,
} from "./api.ts";

const stepLabels = ["Plan", "Assumptions", "Results"] as const;
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
  | {
      page: "running";
      progress: Progress;
      claims: Claim[];
      updates: Record<
        string,
        Partial<Record<ProgressEvent["stage"], ProgressEvent>>
      >;
    }
  | { page: "report"; report: Report; previewProposal?: string };

type DemoStep = Extract<Workflow, { page: "decision" | "claims" | "report" }>;

function demoHistoryStep(exampleId: string | undefined): DemoStep | undefined {
  const entry = window.history.state?.tactileDemo;
  if (!entry || entry.exampleId !== exampleId) return undefined;
  if (entry.page === "decision" || entry.page === "claims")
    return { page: entry.page };
  if (entry.page !== "report") return undefined;
  const parsed = reportSchema.safeParse(entry.report);
  if (parsed.success && parsed.data.mode === "demo")
    return { page: "report", report: parsed.data };
  return undefined;
}

type WorkflowAction =
  | { type: "decision" | "claims" }
  | { type: "restore-demo-step"; step: DemoStep }
  | { type: "start"; claims: Claim[] }
  | ProgressEvent
  | { type: "report"; report: Report }
  | { type: "preview"; report: Report; proposal: string };

function reviewWorkflow(state: Workflow, action: WorkflowAction): Workflow {
  switch (action.type) {
    case "restore-demo-step":
      return action.step;
    case "decision":
    case "claims":
      return { page: action.type };
    case "start":
      return {
        page: "running",
        progress: {},
        claims: action.claims,
        updates: {},
      };
    case "progress":
      if (state.page !== "running") return state;
      if (!action.claimId)
        return {
          ...state,
          progress: { ...state.progress, [action.stage]: action.status },
        };
      return {
        ...state,
        updates: {
          ...state.updates,
          [action.claimId]: {
            ...state.updates[action.claimId],
            [action.stage]: action,
          },
        },
      };
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
type ClaimDraft = Claim & { selected: boolean; checkDraft?: CheckDraft };

function mark(icon: "logo" | "plus" | "remove") {
  const paths = {
    logo: "M3 18h5v-5h5V8h5V3h3",
    plus: "M12 5v14M5 12h14",
    remove: "M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5",
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
  return claims.map((claim) => ({
    ...claim,
    selected: true,
    checkDraft: claim.engineeringCheck
      ? {
          kind: claim.engineeringCheck.kind,
          values: claim.engineeringCheck.values.map(String),
        }
      : undefined,
  }));
}

function exportReport(proposal: string, report: Report) {
  downloadText(
    "tactile-review.md",
    toMarkdown(proposal, report, window.location.origin),
    "text/markdown;charset=utf-8",
  );
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
          checkDraft: z
            .object({
              kind: engineeringCheckSchema.shape.kind,
              values: z.array(z.string().max(32)).max(5),
            })
            .optional(),
        }),
      )
      .max(limits.claims),
    projectEvidence: z
      .array(
        projectEvidenceSchema.extend({
          title: z.string().max(100),
          text: z.string().max(limits.evidenceText),
        }),
      )
      .max(limits.evidenceItems)
      .optional(),
    mode: z.enum(["demo", "live"]),
    reviewers: reviewersSchema.optional(),
    decision: decisionContextSchema.optional(),
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
    return result.success
      ? result.data.map((entry) => ({
          ...entry,
          report: restoreDemoReport(entry.proposal, entry.report),
        }))
      : [];
  } catch {
    return [];
  }
}

function readDraft(key: string) {
  try {
    const result = savedDraftSchema.safeParse(
      JSON.parse(sessionStorage.getItem(key) ?? "null"),
    );
    if (!result.success) return undefined;
    const draft = result.data;
    return {
      ...draft,
      report: draft.report
        ? restoreDemoReport(draft.proposal, draft.report)
        : undefined,
    };
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
  publicDemo = false,
}: {
  token?: string;
  account?: string;
  accountId?: string;
  startExample: boolean;
  publicDemo?: boolean;
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
  const storageKey = publicDemo
    ? `tactile-public-demo-v1:${scenarioId}:draft`
    : `tactile-review-v1:${accountId ?? "guest"}:${locationKey}`;
  const recentKey = `tactile-review-v1:${accountId ?? "guest"}:recent`;
  const [recent, setRecent] = useState(() =>
    publicDemo ? [] : readRecent(recentKey),
  );
  const [historyMessage, setHistoryMessage] = useState("");
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const reduceMotion = useReducedMotion();
  const enter: MotionProps = {
    initial: reduceMotion ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  };
  const [saved] = useState(() => {
    const draft = readDraft(storageKey);
    if (
      publicDemo &&
      (draft?.mode !== "demo" ||
        draft.proposal !== example.proposal ||
        draft.projectEvidence?.length ||
        (draft.report && draft.report.mode !== "demo"))
    )
      return undefined;
    return draft;
  });
  const [state, dispatch] = useReducer(
    reviewWorkflow,
    undefined,
    (): Workflow => {
      const entry = publicDemo ? demoHistoryStep(scenarioId) : undefined;
      // A tab opened or restored without its draft can still start the recorded example.
      if (entry && (entry.page === "decision" || saved)) return entry;
      return saved?.page === "report" && saved.report
        ? { page: "report", report: saved.report }
        : {
            page:
              saved?.page === "claims" || (!saved && startExample)
                ? "claims"
                : "decision",
          };
    },
  );
  const { page } = state;
  const [operatorSession, setOperatorSession] = useState<string>();
  const report = page === "report" ? state.report : undefined;
  const uncheckedCriticalClaims = report?.uncheckedCriticalClaims ?? [];
  const memoSections = decisionMemoSections(report?.crossfireMemo);
  const progress = page === "running" ? state.progress : undefined;
  const completedStages = Object.values(progress ?? {}).filter(
    (status) => status === "done",
  ).length;
  const parsedModel = reviewModelSchema.safeParse(report?.model);
  const modelName = parsedModel.success
    ? reviewModels[parsedModel.data].name
    : report?.model;
  const unreadableCount =
    report?.mode === "live"
      ? uniqueSourcesByUrl(report.sources.filter(({ passage }) => !passage))
          .length
      : 0;
  const previewProposal = page === "report" ? state.previewProposal : undefined;
  const [proposal, setProposal] = useState(
    saved?.proposal ?? (startExample || publicDemo ? example.proposal : ""),
  );
  const reportProposal = previewProposal ?? proposal;
  const [claims, setClaims] = useState<ClaimDraft[]>(
    () => saved?.claims ?? (startExample ? seedDraft(example.claims) : []),
  );
  const [projectEvidence, setProjectEvidence] = useState<EvidenceDraft[]>(
    () => saved?.projectEvidence ?? [],
  );
  const [decision, setDecision] = useState<DecisionContext | undefined>(
    saved?.decision,
  );
  const inferredDecision = claims.find(({ crossfire }) => crossfire)?.crossfire;
  const decisionFields = decision ?? {
    reversibility: inferredDecision?.reversibility ?? null,
    deadline: inferredDecision?.deadline ?? "",
  };
  const [reviewerSelection, setReviewerSelection] = useState<
    Reviewer[] | undefined
  >(saved?.reviewers);
  const reviewPanel =
    reviewerSelection ??
    claims.find(({ crossfire }) => crossfire)?.crossfire?.agents ??
    reviewerIds;
  const [reviewMode, setMode] = useState<"demo" | "live">(
    saved?.mode ?? "demo",
  );
  const mode = publicDemo ? "demo" : reviewMode;
  const [availability, setAvailability] = useState<
    "checking" | "live" | "demo" | "unavailable"
  >(publicDemo ? "demo" : "checking");
  const [extracting, setExtracting] = useState(false);
  const [readingAttachment, setReadingAttachment] = useState(false);
  const [clarification, setClarification] = useState<{
    details: IntakeClarification["details"];
    round: number;
  }>();
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const proposalField = useRef<HTMLTextAreaElement>(null);
  const previousPage = useRef<Workflow["page"]>("decision");
  const initializedDemoHistory = useRef(false);
  const selected = claims.filter((claim) => claim.selected);
  const selectionGuidance = !selected.length
    ? claims.length
      ? "Include at least one assumption to run checks."
      : "Add an assumption to start checking your plan."
    : undefined;
  const current = page === "decision" ? 0 : page === "claims" ? 1 : 2;

  useLayoutEffect(() => {
    if (!publicDemo || page === "running") return;
    const currentEntry = demoHistoryStep(scenarioId);
    const method = initializedDemoHistory.current
      ? "pushState"
      : "replaceState";
    initializedDemoHistory.current = true;
    if (currentEntry?.page === page) return;
    window.history[method](
      {
        ...window.history.state,
        tactileDemo: { exampleId: scenarioId, page, report },
      },
      "",
    );
  }, [publicDemo, scenarioId, page, report]);

  useEffect(() => {
    if (!publicDemo) return;
    function restoreStep() {
      const entry = demoHistoryStep(scenarioId);
      if (!entry) return;
      request.current?.abort();
      request.current = null;
      setError("");
      setCopyStatus("");
      dispatch({ type: "restore-demo-step", step: entry });
    }
    window.addEventListener("popstate", restoreStep);
    return () => window.removeEventListener("popstate", restoreStep);
  }, [publicDemo, scenarioId]);

  useEffect(() => {
    if (previewProposal !== undefined) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          page: page === "running" ? "claims" : page,
          proposal,
          claims,
          projectEvidence,
          reviewers: reviewerSelection,
          decision,
          mode,
          report,
        }),
      );
    } catch {
      // The review remains usable when browser storage is unavailable.
    }
  }, [
    storageKey,
    page,
    proposal,
    claims,
    projectEvidence,
    reviewerSelection,
    decision,
    mode,
    report,
    previewProposal,
  ]);

  useEffect(() => {
    if (publicDemo) return;
    try {
      sessionStorage.setItem(recentKey, JSON.stringify(recent));
    } catch {
      // Browser storage can be unavailable.
    }
  }, [publicDemo, recentKey, recent]);

  useEffect(() => {
    if (publicDemo) return;
    const controller = new AbortController();
    liveAvailable(controller.signal, token).then(
      (live) => {
        if (!controller.signal.aborted) setAvailability(live ? "live" : "demo");
      },
      () => {
        if (!controller.signal.aborted) setAvailability("unavailable");
      },
    );
    return () => {
      controller.abort();
    };
  }, [publicDemo, token]);

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
    if (publicDemo) {
      if (claims.length) dispatch({ type: "claims" });
      else openDemo();
      return;
    }
    if (availability === "demo" || availability === "unavailable") {
      if (proposal.trim() === example.proposal) openDemo();
      else
        setError(
          availability === "unavailable"
            ? "Live reviews are temporarily unavailable. Refresh to try again. Your plan is saved in this tab."
            : "To analyze your own plan, add a Meta Model API key in Settings. You can try an example now.",
        );
      return;
    }
    const context = projectEvidence.flatMap((entry) => {
      const result = projectEvidenceSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
    const text = proposal.trim() || context[0]?.text.slice(0, 500);
    const parsed = proposalSchema.safeParse(text);
    if (!parsed.success) {
      setError(
        "Describe your plan in at least 20 characters or add an attachment with readable text.",
      );
      proposalField.current?.focus();
      return;
    }
    if (availability !== "live" || request.current || readingAttachment) return;
    const controller = new AbortController();
    request.current = controller;
    setExtracting(true);
    setError("");
    try {
      const result = await extractLive(
        {
          proposal: parsed.data,
          projectEvidence: context.length ? context : undefined,
          clarification: clarification && {
            round: Math.min(clarification.round, 3),
            previousQuestion: clarification.details.question,
          },
        },
        controller.signal,
        token,
      );
      if (controller.signal.aborted) return;
      setProposal(parsed.data);
      setClarification(undefined);
      setClaims(seedDraft(result));
      setDecision(undefined);
      setReviewerSelection(undefined);
      setMode("live");
      dispatch({ type: "claims" });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof IntakeClarification) {
        setProposal(parsed.data);
        setClarification({
          details: cause.details,
          round: (clarification?.round ?? 0) + 1,
        });
        proposalField.current?.focus();
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "We couldn't identify assumptions. Try again.",
        );
      }
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
      Pick<
        ClaimDraft,
        "text" | "selected" | "risk" | "loadBearing" | "checkDraft"
      >
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
    const reviewClaims = selected.map(({ checkDraft, ...claim }) => ({
      ...claim,
      engineeringCheck:
        !publicDemo && checkDraft
          ? {
              kind: checkDraft.kind,
              values: checkDraft.values.map((value) =>
                value.trim() ? Number(value) : NaN,
              ),
            }
          : undefined,
    }));
    const input = reviewInputSchema.safeParse({
      proposal,
      claims: reviewClaims,
      projectEvidence: mode === "live" ? projectEvidence : undefined,
      reviewers: mode === "live" ? reviewPanel : undefined,
      decision: mode === "live" ? decision : undefined,
    });
    if (!input.success || selected.some((claim) => !claim.text.trim())) {
      setError(
        publicDemo
          ? "Write a statement for each assumption you want to check."
          : "Write a statement for each selected assumption. If you added checks or evidence in Advanced settings, complete their fields.",
      );
      return;
    }
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setCopyStatus("");
    dispatch({ type: "start", claims: input.data.claims });
    const roomFeed = import.meta.env.DEV
      ? startControlRoomFeed(
          mode === "live" ? reviewPanel : reviewerIds,
          mode === "live" ? "live" : "recorded",
        )
      : undefined;
    setOperatorSession(roomFeed?.id);
    const emit = (event: ReviewEvent) => {
      if (controller.signal.aborted || event.type === "error") return;
      roomFeed?.event(event);
      if (event.type === "report" && !publicDemo) {
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
      roomFeed?.finish();
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
    setOperatorSession(undefined);
    setCopyStatus("");
    setError("");
    dispatch({
      type: "preview",
      report: entry.report,
      proposal: entry.proposal,
    });
  }

  function deleteRecent(id: string) {
    setRecent((entries) => entries.filter((entry) => entry.id !== id));
    setHistoryMessage("Report deleted from this tab.");
    historyHeading.current?.focus();
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

  function recheck(finding: Finding) {
    setProposal(reportProposal);
    setClaims(seedDraft([finding.claim]));
    setReviewerSelection(report?.crossfireReviewers);
    setMode("live");
    setError("");
    dispatch({ type: "claims" });
  }

  function useRevisedProposal(next: string) {
    setCopyStatus("");
    setProposal(next);
    setClaims([]);
    setDecision(undefined);
    setClarification(undefined);
    setReviewerSelection(undefined);
    setError("");
    dispatch({ type: "decision" });
  }

  function restart() {
    setCopyStatus("");
    dispatch({ type: "decision" });
    setProposal(publicDemo ? example.proposal : "");
    setClarification(undefined);
    setDecision(undefined);
    setClaims([]);
    setReviewerSelection(undefined);
    setProjectEvidence([]);
    setError("");
  }

  const reportDetails = report && (
    <div className="report-details review-disclosures">
      {memoSections.length > 0 && (
        <details className="proposal memo-details">
          <summary>How we reached this result</summary>
          {report.crossfireReviewers && (
            <p className="section-note">
              Reviewers{" "}
              {report.crossfireReviewers
                .map((id) => reviewers[id].name)
                .join(", ")}{" "}
              and Steelman
            </p>
          )}
          <div className="memo-sections">
            {memoSections.map(({ title, items }) => (
              <section key={title}>
                <h4>{title}</h4>
                <ul>
                  {items.filter(Boolean).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </details>
      )}
      <details className="proposal">
        <summary>Read your plan</summary>
        <p>{reportProposal}</p>
      </details>
      <RecordedReviewRoom report={report} />
      {report.crossfireDecision && previewProposal === undefined && (
        <ProposalRevision
          proposal={reportProposal}
          report={report}
          token={token}
          onUse={useRevisedProposal}
        />
      )}
    </div>
  );

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
            {publicDemo ? (
              <a href="/review">Workspace</a>
            ) : (
              <a href="/settings">Settings</a>
            )}
            <ThemeToggle />
            <a href="https://github.com/SammyRyuga/tactile">
              GitHub <ActionArrow />
            </a>
          </nav>
        </div>
      </header>

      <main
        id="content"
        className="workspace review-workspace"
        data-page={page}
        tabIndex={-1}
      >
        {account && (
          <div className="account-strip">
            <span className="account-name">
              <span className={page === "decision" ? undefined : "sr-only"}>
                Signed in as{" "}
              </span>
              {account}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={() => void signOut?.()}
            >
              Sign out
            </button>
          </div>
        )}
        <div
          className="review-masthead"
          data-compact={page !== "decision" || undefined}
        >
          <div className={page === "decision" ? "intro" : "sr-only"}>
            <h1>{publicDemo ? "Public demo" : "Review a plan"}</h1>
            {page === "decision" && (
              <p>
                {publicDemo
                  ? "Try a sample plan and replay its recorded checks without signing in."
                  : "Find the assumptions your plan depends on and see what to check before moving ahead."}
              </p>
            )}
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
                {publicDemo ? example.title : "Describe your plan"}
              </h2>
              <form onSubmit={onExtract}>
                <label htmlFor="proposal">
                  {publicDemo ? "Bundled plan" : "Your plan"}
                </label>
                <p id="proposal-hint" className="proposal-hint">
                  {publicDemo
                    ? "Start with this plan or pick another example."
                    : "What are you changing, and what should improve?"}
                </p>
                <textarea
                  ref={proposalField}
                  id="proposal"
                  value={proposal}
                  disabled={extracting}
                  readOnly={publicDemo}
                  maxLength={limits.proposal}
                  aria-describedby="proposal-hint"
                  placeholder="We plan to run fewer tests on each pull request to get faster feedback. We still need to catch bugs in packages that depend on the changed code."
                  onChange={(event) => {
                    setProposal(event.target.value);
                    setError("");
                  }}
                />
                {clarification && (
                  <div className="proposal intake-clarification" role="status">
                    <strong>{clarification.details.question}</strong>
                    {clarification.details.interpretation && (
                      <p>{clarification.details.interpretation}</p>
                    )}
                    {clarification.details.missing.length > 0 && (
                      <ul>
                        {clarification.details.missing.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    )}
                    <p>Add those details to your plan and try again.</p>
                    {!!clarification.details.suggestions?.length && (
                      <button
                        className="button"
                        type="button"
                        onClick={() => {
                          setClaims(
                            seedDraft(
                              clarification.details.suggestions ?? [],
                            ).map((claim) => ({ ...claim, selected: false })),
                          );
                          setReviewerSelection(undefined);
                          setMode("live");
                          setClarification(undefined);
                          dispatch({ type: "claims" });
                        }}
                      >
                        Review suggested assumptions
                      </button>
                    )}
                  </div>
                )}
                {!publicDemo && (
                  <ProposalAttachments
                    value={projectEvidence}
                    onChange={setProjectEvidence}
                    onBusyChange={setReadingAttachment}
                    disabled={extracting}
                    token={token}
                  />
                )}
                {availability === "demo" &&
                  proposal.trim() !== example.proposal && (
                    <p className="field-note">
                      To review your own plan, add a Meta API key in{" "}
                      <a href="/settings">Settings</a>.
                    </p>
                  )}
                {availability === "live" && (
                  <p className="field-note">
                    Tactile sends your plan and readable attachment text to the
                    model for review. Share only information you’re allowed to
                    send.
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
                      readingAttachment ||
                      availability === "checking"
                    }
                  >
                    {publicDemo
                      ? "Review example"
                      : extracting
                        ? "Finding assumptions…"
                        : "Analyze my plan"}
                  </button>
                </div>
              </form>
              {accountId && <OutcomeLog accountId={accountId} />}
            </section>
            <aside className="workspace-sidebar">
              <section className="panel workspace-library">
                <h2>Example library</h2>
                <ul className="workspace-list">
                  {demoExamples.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`${publicDemo ? "/demo" : "/review"}?example=${item.id}`}
                        aria-current={
                          publicDemo && item.id === scenarioId
                            ? "page"
                            : undefined
                        }
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.title}</small>
                        </span>
                        <ActionArrow />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
              {(recent.length > 0 || historyMessage) && (
                <section
                  className="panel workspace-history"
                  aria-labelledby="recent-reports-title"
                >
                  <h2
                    id="recent-reports-title"
                    ref={historyHeading}
                    tabIndex={-1}
                  >
                    Recent reports
                  </h2>
                  <p role="status">{historyMessage || "Saved in this tab."}</p>
                  {recent.length > 0 && (
                    <ul className="workspace-list">
                      {recent.map((entry) => {
                        const title = entry.proposal
                          .trim()
                          .split(/(?<=[.!?])\s+|\n/, 1)[0];
                        return (
                          <li key={entry.id}>
                            <button type="button" onClick={() => reopen(entry)}>
                              <span>
                                <strong className="workspace-report-title">
                                  {title}
                                </strong>
                                <small>
                                  <time dateTime={entry.savedAt}>
                                    {new Date(entry.savedAt).toLocaleDateString(
                                      undefined,
                                      {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      },
                                    )}
                                  </time>
                                  {" · "}
                                  {entry.report.mode === "live"
                                    ? "Live review"
                                    : "Bundled example"}
                                </small>
                              </span>
                              <ActionArrow />
                            </button>
                            <button
                              className="history-delete"
                              type="button"
                              aria-label={`Delete report ${title}`}
                              title="Delete report"
                              onClick={() => deleteRecent(entry.id)}
                            >
                              {mark("remove")}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
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
                  Review assumptions
                </h2>
                <p>
                  Edit or add assumptions and choose which to check. Mark one as
                  critical if the plan depends on it.
                </p>
              </div>
              <div className="claim-count" role="status" aria-atomic="true">
                <div className="claim-count-track" aria-hidden="true">
                  {claims.map(({ id }, index) => (
                    <span key={id} data-filled={index < selected.length} />
                  ))}
                </div>
                <span>
                  <strong>
                    {selected.length} of {claims.length}
                  </strong>{" "}
                  selected
                </span>
                {selectionGuidance && (
                  <span className="sr-only">
                    {claims.length
                      ? ". Select at least one assumption to run checks."
                      : ". Add an assumption to run checks."}
                  </span>
                )}
              </div>
            </div>
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
                        Assumption {index + 1}
                      </label>
                      <div className="claim-row-actions">
                        <label
                          className="check-label claim-pick"
                          data-checked={claim.selected}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Include assumption ${index + 1}`}
                            checked={claim.selected}
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
                          aria-label={`Remove assumption ${index + 1}`}
                          title="Remove assumption"
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
                      placeholder="Write something that needs to be true"
                      maxLength={limits.claim}
                      onChange={(event) =>
                        updateClaim(claim.id, { text: event.target.value })
                      }
                    />
                    <label
                      className="check-label claim-priority"
                      data-checked={Boolean(claim.loadBearing)}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Critical assumption ${index + 1}`}
                        checked={Boolean(claim.loadBearing)}
                        onChange={(event) =>
                          updateClaim(claim.id, {
                            loadBearing: event.target.checked,
                          })
                        }
                      />
                      <span>Critical assumption</span>
                    </label>
                  </div>
                ))}
              </div>
              {selectionGuidance && (
                <p className="field-note" id="selection-guidance">
                  {selectionGuidance}
                </p>
              )}
              <ReviewSettings
                proposal={proposal}
                claims={claims}
                onClaimChange={updateClaim}
                live={
                  mode === "live"
                    ? {
                        decision: decisionFields,
                        onDecisionChange: setDecision,
                        panel: reviewPanel,
                        onPanelChange: setReviewerSelection,
                        evidence: projectEvidence,
                        onEvidenceChange: setProjectEvidence,
                      }
                    : undefined
                }
              />
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
                    {mark("plus")} Add assumption
                  </button>
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
                    Back to plan
                  </button>
                  <button
                    type="submit"
                    className="button primary"
                    disabled={!selected.length}
                    aria-describedby={
                      selectionGuidance ? "selection-guidance" : undefined
                    }
                  >
                    Run checks <ActionArrow />
                  </button>
                </div>
              </div>
            </form>
          </motion.section>
        )}

        {page === "running" && (
          <motion.section key="running" className="panel" {...enter}>
            <h2 ref={heading} tabIndex={-1}>
              Checking your assumptions
            </h2>
            <p className="section-note">
              {mode === "demo" ? "Recorded example" : "Live review"}
            </p>
            <p className="review-progress" role="status">
              {progress?.Synthesis === "running"
                ? "Putting the results together…"
                : completedStages
                  ? `${completedStages} review ${completedStages === 1 ? "stage" : "stages"} complete.`
                  : mode === "demo"
                    ? "Replaying the recorded checks…"
                    : "Checking the assumptions you selected…"}
            </p>
            <details className="proposal review-room-disclosure">
              <summary>Explore the review room</summary>
              <LiveReviewRoom
                claims={state.claims}
                progress={state.progress}
                updates={state.updates}
                panel={mode === "live" ? reviewPanel : undefined}
              />
            </details>
            <details className="proposal review-activity">
              <summary>See check activity</summary>
              <ul className="activity">
                {stages
                  .filter((stage) => {
                    if (mode === "demo") return Boolean(progress?.[stage]);
                    const reviewer = reviewerByStage[stage];
                    return !reviewer || reviewPanel.includes(reviewer);
                  })
                  .map((stage) => (
                    <li
                      key={stage}
                      data-status={progress?.[stage] ?? "waiting"}
                    >
                      <strong>
                        {mode === "demo" && stage === "Synthesis"
                          ? "Prepare memo"
                          : mode === "live"
                            ? reviewerStageLabel(stage)
                            : stage}
                      </strong>
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
              {mode === "live" && Object.keys(state.updates).length > 0 && (
                <div className="claim-activity">
                  {state.claims
                    .filter(({ id }) => state.updates[id])
                    .map((claim) => (
                      <details className="proposal" key={claim.id}>
                        <summary>{claim.text}</summary>
                        <ul>
                          {Object.values(state.updates[claim.id]).map(
                            ({ stage, status, detail }) => (
                              <li key={stage}>
                                <strong>{reviewerStageLabel(stage)}</strong> ·{" "}
                                {status === "done"
                                  ? "Complete"
                                  : status === "unavailable"
                                    ? "Incomplete"
                                    : "In progress"}
                                {detail && <blockquote>{detail}</blockquote>}
                              </li>
                            ),
                          )}
                        </ul>
                      </details>
                    ))}
                </div>
              )}
            </details>
            <button type="button" className="button" onClick={cancelReview}>
              Cancel review
            </button>
          </motion.section>
        )}

        {operatorSession && (page === "running" || page === "report") && (
          <section
            key={operatorSession}
            className="operator-room-panel"
            aria-labelledby="operator-room-title"
          >
            <h2 id="operator-room-title">Operator room</h2>
            <iframe
              title="Operator room showing review progress"
              src={`/control-room/?review=${encodeURIComponent(operatorSession)}`}
            />
          </section>
        )}

        {page === "report" && report && (
          <motion.section key="report" className="panel report" {...enter}>
            <div className="split report-header">
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  Review results
                </h2>
                <p className="section-note">
                  {report.mode === "demo"
                    ? "Bundled example evidence"
                    : "Live review"}
                  {modelName && ` · ${modelName}`}
                  {report.verifier?.distinct &&
                    ` · Verified by ${report.verifier.model}`}
                </p>
              </div>
              <div className="report-actions">
                <div className="actions report-tools">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void copyReport(report)}
                  >
                    Copy Markdown
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={(event) => {
                      // A native click sequence identifies repeated pointer activations.
                      if (event.detail < 2)
                        exportReport(reportProposal, report);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.repeat &&
                        (event.key === "Enter" || event.key === " ")
                      )
                        event.preventDefault();
                    }}
                  >
                    <ActionArrow direction="down" /> Export Markdown
                  </button>
                </div>
                <span className="field-note report-copy-status" role="status">
                  {copyStatus}
                </span>
              </div>
            </div>
            <div className="recommendation">
              <h3>
                {report.crossfireDecision ??
                  recordedConclusion(report) ??
                  "Recommended next step"}
              </h3>
              <p>{report.recommendation}</p>
            </div>
            {uncheckedCriticalClaims.length > 0 && (
              <section
                className="claim-coverage"
                aria-labelledby="claim-coverage-title"
              >
                <h3 id="claim-coverage-title">Claim coverage</h3>
                <p>
                  The verdicts below cover only the claims submitted for this
                  run.
                </p>
                <p>
                  <strong>{uncheckedCriticalClaimsLabel}</strong>
                </p>
                <ul>
                  {uncheckedCriticalClaims.map((claim) => (
                    <li key={claim}>{claim}</li>
                  ))}
                </ul>
              </section>
            )}
            {unreadableCount > 0 && (
              <p className="field-note">
                {unreadableCount} unreadable{" "}
                {unreadableCount === 1 ? "source" : "sources"}. See the review
                trails for details.
              </p>
            )}
            <div className="findings">
              {report.findings.map((finding) => (
                <article key={finding.claim.id} className="finding">
                  <span
                    className={`verdict ${(finding.verdict === "Survived" ? "No credible break found" : finding.verdict === "Broken" ? "Contradicted" : finding.verdict).toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {finding.verdict === "Survived"
                      ? "No issue found"
                      : finding.verdict === "Broken"
                        ? "Problem found"
                        : finding.verdict}
                  </span>
                  {finding.basis && (
                    <span className="finding-basis">
                      {finding.basis === "proposal"
                        ? "Proposal reasoning"
                        : finding.basis === "arithmetic"
                          ? "Arithmetic check"
                          : finding.basis === "project"
                            ? "Project evidence"
                            : finding.basis === "engineering"
                              ? "Engineering check"
                              : "Verified source"}
                    </span>
                  )}
                  {finding.verificationDisagreement && (
                    <span className="finding-basis">Verifier disagreed</span>
                  )}
                  <h3>{finding.claim.text}</h3>
                  <p>{finding.rationale}</p>
                  <p>
                    <strong>Next step</strong> {finding.nextStep}
                  </p>
                  <ReviewTrail
                    finding={finding}
                    sources={report.sources}
                    crossfire={Boolean(report.crossfireDecision)}
                  />
                  {report.mode === "live" && (
                    <MeasurementArtifact finding={finding} />
                  )}
                  {report.mode === "live" && previewProposal === undefined && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => recheck(finding)}
                    >
                      Re-review this claim
                    </button>
                  )}
                  {finding.sourceIds.length > 0 && (
                    <ul className="sources" aria-label="Sources">
                      {uniqueSourcesByUrl(
                        report.sources.filter(({ id }) =>
                          finding.sourceIds.includes(id),
                        ),
                      ).map((source) => (
                        <li key={source.id}>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.title} <ActionArrow />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
            {reportDetails}
            {report.mode === "live" && accountId && (
              <OutcomeLog
                accountId={accountId}
                proposal={reportProposal}
                report={report}
                key={reportProposal}
              />
            )}
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
                    Edit assumptions
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={restart}
                  >
                    {publicDemo
                      ? "Choose another example"
                      : "Start a new review"}
                  </button>
                </>
              )}
            </div>
          </motion.section>
        )}

        <footer>
          <TeamCredits />
        </footer>
      </main>
    </>
  );
}
