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
    url: "/example-evidence.html#dependency-replay",
  },
  {
    id: "ci-config",
    title: "Bundled rollout configuration",
    url: "/example-evidence.html#rollout-configuration",
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

type DemoExample = {
  id: string;
  title: string;
  label: string;
  proposal: string;
  claims: Claim[];
  findings: Finding[];
  sources: Source[];
  recommendation?: string;
};

const replicaClaims: Claim[] = [
  {
    id: "new-order",
    text: "A replica always returns an order immediately after checkout writes it.",
    risk: "technical",
    loadBearing: true,
  },
  {
    id: "replica-latency",
    text: "Moving all reads to the replica lowers checkout p95 latency.",
    risk: "evidence",
  },
];
const flagClaims: Claim[] = [
  {
    id: "previous-writes",
    text: "Disabling the feature flag reverses records already changed by the migration.",
    risk: "technical",
    loadBearing: true,
  },
  {
    id: "future-writes",
    text: "Disabling the flag prevents future requests from taking the flagged write path.",
    risk: "adoption",
  },
];

export const demoExamples: DemoExample[] = [
  {
    id: "ci",
    title: "Run fewer tests per pull request",
    label: "CI coverage",
    proposal: demoProposal,
    claims: demoClaims,
    findings,
    sources,
  },
  {
    id: "replica",
    title: "Move checkout reads to a replica",
    label: "Data consistency",
    proposal:
      "Route checkout reads to an asynchronous database replica to reduce load on the primary. Checkout fetches the new order immediately after writing it. The team has yet to measure replica delay or p95 latency on this workload.",
    claims: replicaClaims,
    sources: [
      {
        id: "replica-timeline",
        title: "Bundled replica timeline",
        url: "/example-evidence.html#replica-timeline",
      },
    ],
    recommendation:
      "Keep immediate order lookups on the primary while measuring lag and cold-path latency during a shadow trial.",
    findings: [
      {
        claim: replicaClaims[0],
        verdict: "Contradicted",
        rationale:
          "A read can reach the replica in the interval between primary commit and replica replay.",
        nextStep:
          "Exercise read-after-write flows with delayed replica replay.",
        sourceIds: ["replica-timeline"],
        repair: {
          minimalFix: "Keep reads following a checkout write on the primary.",
          tradeoff: "A portion of read load stays on the primary.",
        },
        audit: [
          {
            stage: "Feasibility",
            status: "complete",
            observation:
              "The bundled timeline puts the first checkout lookup before replica replay.",
            sourceIds: ["replica-timeline"],
          },
        ],
      },
      {
        claim: replicaClaims[1],
        verdict: "Unresolved",
        rationale:
          "The fixture establishes an ordering risk. It contains no checkout latency distribution.",
        nextStep: "Compare p95 and p99 from a representative read mix.",
        sourceIds: [],
        reason: "Evidence insufficient",
        missingInformation:
          "Representative checkout latency measured on both routes.",
        audit: [
          {
            stage: "Evidence",
            status: "complete",
            observation:
              "The fixture contains no production latency measurements.",
          },
        ],
      },
    ],
  },
  {
    id: "flag",
    title: "Use a feature flag as a rollback",
    label: "Rollout safety",
    proposal:
      "Ship a new record writer behind a feature flag. It updates existing records in place. If errors rise, disable the flag and treat the previous record state as restored.",
    claims: flagClaims,
    sources: [
      {
        id: "flag-timeline",
        title: "Bundled flag timeline",
        url: "/example-evidence.html#flag-timeline",
      },
    ],
    recommendation:
      "Pair the feature flag with a tested data repair or a reversible write strategy before expanding the rollout.",
    findings: [
      {
        claim: flagClaims[0],
        verdict: "Contradicted",
        rationale:
          "The bundled timeline leaves a completed record mutation in storage after the flag is switched off.",
        nextStep: "Test restoring a mutated record in staging.",
        sourceIds: ["flag-timeline"],
        repair: {
          minimalFix:
            "Preserve the previous representation or add a tested repair job.",
          tradeoff:
            "The rollout needs temporary storage or an extra recovery operation.",
        },
        audit: [
          {
            stage: "Feasibility",
            status: "complete",
            observation:
              "Flag evaluation has no write path for restoring stored values.",
            sourceIds: ["flag-timeline"],
          },
        ],
      },
      {
        claim: flagClaims[1],
        verdict: "Supported",
        rationale:
          "In the bundled example, new requests evaluate the flag before selecting a writer.",
        nextStep:
          "Measure propagation across workers before relying on a time bound.",
        sourceIds: ["flag-timeline"],
        audit: [
          {
            stage: "Adoption",
            status: "complete",
            observation:
              "Each new request checks the current rollout flag in this fixture.",
            sourceIds: ["flag-timeline"],
          },
        ],
      },
    ],
  },
];

export function demoReport(input: ReviewInput): Report {
  const example = demoExamples.find(
    ({ proposal }) => proposal === input.proposal.trim(),
  );
  const reviewed = input.claims.map((claim): Finding => {
    const fixture = example?.findings.find(
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
    ? (example?.recommendation ??
      "Pilot affected-package testing with dependent packages before removing the full pull request suite.")
    : "Collect evidence for unresolved claims before changing the current workflow.";
  const cited = new Set(reviewed.flatMap(({ sourceIds }) => sourceIds));
  return {
    mode: "demo",
    recommendation,
    findings: reviewed,
    sources: (example?.sources ?? []).filter(({ id }) => cited.has(id)),
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
  const report = demoReport(input);
  const recorded = new Set(
    report.findings.flatMap(({ audit }) =>
      (audit ?? []).map(({ stage }) => stage),
    ),
  );
  recorded.add("Synthesis");
  for (const stage of stages.filter((stage) => recorded.has(stage))) {
    emit({ type: "progress", stage, status: "running" });
    await yieldToBrowser(signal);
    emit({ type: "progress", stage, status: "done" });
  }
  signal.throwIfAborted();
  emit({ type: "report", report });
}
