import type {
  Claim,
  Finding,
  Report,
  ReviewEvent,
  ReviewInput,
  Source,
} from "./review.ts";
import { stages } from "./review.ts";

export const demoProposal =
  "Replace full test runs on pull requests with changed-package tests. Our TypeScript monorepo has a shared schema package consumed by checkout and reporting. We want faster feedback without missing regressions. Keep the full suite on the main branch during rollout.";

export const demoClaims: Claim[] = [
  {
    id: "coverage",
    risk: "technical",
    loadBearing: true,
    text: "Testing only the changed package catches regressions in its consumers.",
  },
  {
    id: "speed",
    risk: "evidence",
    loadBearing: true,
    text: "Changed-package testing reduces pull request feedback time.",
  },
  {
    id: "rollback",
    risk: "adoption",
    text: "Keeping full tests on main provides a fallback during rollout.",
  },
  {
    id: "configuration",
    text: "The CI workflow can choose which test command to run.",
  },
];

const sources: Source[] = [
  {
    id: "dependency-replay",
    title: "Bundled dependency replay",
    url: "/demo-evidence.html#dependency-replay",
  },
  {
    id: "ci-config",
    title: "Bundled rollout configuration",
    url: "/demo-evidence.html#rollout-configuration",
  },
];

const findings: Finding[] = [
  {
    claim: demoClaims[0],
    verdict: "Contradicted",
    rationale:
      "The replay changes a shared export. The changed package passes its own checks, while the checkout test fails when run as a dependent.",
    nextStep: "Run tests for transitive dependents of every changed package.",
    sourceIds: ["dependency-replay"],
    repair: {
      minimalFix:
        "Run tests for changed packages and every transitive dependent before merge.",
      tradeoff:
        "Changes to widely shared packages may still trigger most of the suite.",
    },
    audit: [
      {
        stage: "Feasibility",
        status: "complete",
        observation: "The consumer imports the changed public schema contract.",
      },
      {
        stage: "Evidence",
        status: "complete",
        observation:
          "The bundled example shows how the shared package can pass while its consumer breaks.",
        sourceIds: ["dependency-replay"],
      },
    ],
  },
  {
    claim: demoClaims[1],
    verdict: "Unresolved",
    reason: "Evidence insufficient",
    missingInformation:
      "Queue and execution timings from representative pull requests under both strategies.",
    audit: [
      {
        stage: "Evidence",
        status: "complete",
        observation: "The fixture contains no timing measurements.",
      },
    ],
    rationale:
      "The replay checks coverage. It has no representative pull request timing sample.",
    nextStep:
      "Record queue and test time for both strategies on 20 representative pull requests.",
    sourceIds: [],
  },
  {
    claim: demoClaims[2],
    verdict: "Weakened",
    rationale:
      "A full run on main exposes gaps and gives maintainers a rollback signal, but it detects a missed regression after merge.",
    nextStep:
      "Keep full runs while shadowing affected-package tests on pull requests.",
    sourceIds: ["ci-config"],
    repair: {
      minimalFix: "Keep a full-suite check on pull requests during the pilot.",
      tradeoff: "The pilot measures savings before it reduces merge latency.",
    },
    audit: [
      {
        stage: "Adoption",
        status: "complete",
        observation:
          "Main-branch checks alert the team after the change has merged.",
        sourceIds: ["ci-config"],
      },
    ],
  },
  {
    claim: demoClaims[3],
    verdict: "Supported",
    rationale:
      "The example workflow selects a test command based on the event that started it.",
    nextStep:
      "Validate the filters and retain full tests as the default for unrecognized cases.",
    sourceIds: ["ci-config"],
  },
];

export function demoReport(input: ReviewInput): Report {
  const originalProposal = input.proposal.trim() === demoProposal;
  const reviewed = input.claims.map((claim): Finding => {
    const fixture =
      originalProposal &&
      findings.find(
        (finding) =>
          finding.claim.id === claim.id && finding.claim.text === claim.text,
      );
    return (
      (fixture && { ...fixture, claim }) || {
        claim,
        verdict: "Unresolved",
        reason: "Evidence insufficient",
        missingInformation: "Evidence addressing this version of the claim.",
        rationale:
          "The bundled evidence does not cover this edited or added claim.",
        nextStep:
          "Run a live review of this claim or collect supporting evidence from your own project.",
        sourceIds: [],
      }
    );
  });
  const recommendation = reviewed.some(
    ({ verdict }) => verdict === "Contradicted",
  )
    ? "Pilot affected-package testing with dependent packages before removing the full pull request suite."
    : "Run a shadow trial and collect evidence for any unresolved claims before changing CI.";
  const cited = new Set(reviewed.flatMap(({ sourceIds }) => sourceIds));
  return {
    mode: "demo",
    recommendation,
    findings: reviewed,
    sources: sources.filter(({ id }) => cited.has(id)),
  };
}

function yieldToBrowser(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 120);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export async function runDemo(
  input: ReviewInput,
  emit: (event: ReviewEvent) => void,
  signal: AbortSignal,
) {
  // Yield between fixture stages so users can follow and cancel the local walkthrough.
  for (const stage of stages) {
    emit({ type: "progress", stage, status: "running" });
    await yieldToBrowser(signal);
    emit({ type: "progress", stage, status: "done" });
  }
  emit({ type: "report", report: demoReport(input) });
}
