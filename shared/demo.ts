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
    passageOrigin: "fixture",
    passage: [
      "assert.equal(schema().amount, 12); // Changed package passes.",
      "assert.equal(schema().total, 12);  // Existing checkout contract fails.",
    ].join("\n"),
  },
  {
    id: "ci-config",
    title: "Bundled rollout configuration",
    url: "/example-evidence.html#rollout-configuration",
    passageOrigin: "fixture",
    passage: "pull_request → changed packages\npush to main → full suite",
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
    text: "Disabling the feature flag reverses changes the new writer already made to stored records.",
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
        passageOrigin: "fixture",
        passage: [
          "0 ms   primary commits order 42",
          "8 ms   checkout reads from replica, order 42 is absent",
          "42 ms  replica replays the commit",
          "50 ms  repeated lookup returns order 42",
        ].join("\n"),
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
        passageOrigin: "fixture",
        passage: [
          "Flag ON   request A uses the new writer, updating record 7",
          "Flag OFF  request B uses the old writer",
          "Read 7    the update from request A is still present",
        ].join("\n"),
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

function exampleFor(proposal: string) {
  return demoExamples.find((example) => example.proposal === proposal.trim());
}

function recordedFinding(example: DemoExample | undefined, claim: Claim) {
  return example?.findings.find(
    (finding) =>
      finding.claim.id === claim.id &&
      (finding.claim.text === claim.text ||
        // Drafts from before the wording change use the same recorded claim.
        (example.id === "flag" &&
          claim.id === "previous-writes" &&
          claim.text ===
            "Disabling the feature flag reverses records already changed by the migration.")),
  );
}

function uncheckedCritical(
  example: DemoExample | undefined,
  replayedIds: Set<string>,
) {
  return example?.claims
    .filter((claim) => claim.loadBearing && !replayedIds.has(claim.id))
    .map(({ text }) => text);
}

export function recordedConclusion(report: Report): string | undefined {
  if (
    report.mode === "demo" &&
    report.findings.some(
      ({ claim, verdict, sourceIds }) =>
        claim.id === "previous-writes" &&
        verdict === "Contradicted" &&
        sourceIds.includes("flag-timeline"),
    ) &&
    report.sources.some(
      ({ id, url }) =>
        id === "flag-timeline" &&
        url === "/example-evidence.html#flag-timeline",
    )
  ) {
    return "Do not rely on the feature flag alone for rollback.";
  }
}

export function restoreDemoReport(proposal: string, report: Report): Report {
  if (report.mode !== "demo" || report.uncheckedCriticalClaims) return report;
  const example = exampleFor(proposal);
  if (!example) return report;
  const replayedIds = new Set(
    report.findings.flatMap(
      ({ claim }) => recordedFinding(example, claim)?.claim.id ?? [],
    ),
  );
  return {
    ...report,
    uncheckedCriticalClaims: uncheckedCritical(example, replayedIds),
    sources: report.sources.map((source) => {
      const fixture = example.sources.find(
        ({ id, url }) =>
          id === source.id &&
          url ===
            source.url.replace(
              /^\/demo-evidence\.html/,
              "/example-evidence.html",
            ),
      );
      return fixture ?? source;
    }),
  };
}

const evidenceForClaim: Record<NonNullable<Claim["risk"]>, string> = {
  logic:
    "The inputs and assumptions this claim depends on, plus a concrete example that tests whether its conclusion follows.",
  technical:
    "The result of exercising the behavior this claim promises. Record the inputs, expected outcome or baseline, and what was actually observed.",
  adoption:
    "A rehearsal of the claimed rollout or operating step, with the actor, prerequisites, and observed outcome recorded.",
  evidence:
    "Measurements for the group, conditions, and time window named in this claim, with a baseline if the claim predicts a change.",
};

export function demoReport(input: ReviewInput): Report {
  const example = exampleFor(input.proposal);
  const replayedIds = new Set<string>();
  const reviewed = input.claims.map((claim): Finding => {
    const fixture = recordedFinding(example, claim);
    if (fixture) {
      replayedIds.add(claim.id);
      return { ...fixture, claim };
    }
    return {
      claim,
      verdict: "Unresolved",
      reason: "Evidence insufficient",
      missingInformation: evidenceForClaim[claim.risk ?? "technical"],
      rationale:
        "The bundled evidence does not cover this edited or added claim.",
      nextStep:
        "Define what would count as success for this claim, then gather the evidence below.",
      sourceIds: [],
    };
  });
  const uncheckedCriticalClaims = uncheckedCritical(example, replayedIds);
  const unresolved =
    reviewed.find(
      ({ verdict, claim }) => verdict === "Unresolved" && claim.loadBearing,
    ) ?? reviewed.find(({ verdict }) => verdict === "Unresolved");
  const recommendation = reviewed.some(
    ({ verdict }) => verdict === "Contradicted",
  )
    ? (example?.recommendation ??
      "Pilot affected-package testing with dependent packages before removing the full pull request suite.")
    : uncheckedCriticalClaims?.length
      ? "Restore the original critical wording to replay its recorded checks, or verify the unchecked claims separately before relying on this report."
      : (unresolved?.nextStep ??
        "Use the findings and their next steps to test the plan before rollout.");
  const cited = new Set(
    reviewed.flatMap(({ sourceIds, audit }) => [
      ...sourceIds,
      ...(audit ?? []).flatMap((check) => check.sourceIds ?? []),
    ]),
  );
  return {
    mode: "demo",
    recommendation,
    uncheckedCriticalClaims,
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
