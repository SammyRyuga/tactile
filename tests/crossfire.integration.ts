import assert from "node:assert/strict";
import test from "node:test";
import { createCrossfireEngine } from "../server/crossfire-engine.ts";
import type { ReviewProvider } from "../server/provider.ts";
import type { ReviewEvent } from "../shared/review.ts";

const engine = createCrossfireEngine(process.env.TACTILE_PYTHON);
const proposal = "Switch invoice exports to a queue with independent workers.";

test("the pinned Crossfire engine extracts, ranks, tests, and reconciles through the Tactile gateway", async () => {
  const seen = new Set<string>();
  const provider: ReviewProvider = {
    modelId: "fixture-model",
    async structured() {
      throw new Error("Legacy extraction should never be used.");
    },
    async research() {
      return { text: "", citations: [] };
    },
    async crossfireGenerate(instructions, messages, schema) {
      assert.ok(instructions);
      assert.ok(messages.length > 0);
      const { title } = schema as { title: string };
      seen.add(title);
      switch (title) {
        case "ExtractedClaims":
          return JSON.stringify({
            statements: ["The queue preserves the order of invoice exports."],
            agents: [
              {
                agent: "devils_advocate",
                rationale: "Check ordering assumptions.",
              },
              {
                agent: "builder",
                rationale: "Check implementation constraints.",
              },
              { agent: "operator", rationale: "Check operational friction." },
            ],
          });
        case "LoadBearingRanking":
          return JSON.stringify({
            ranked_indices: [1],
            load_bearing_count: 1,
            reasons: ["Ordering is part of the decision."],
          });
        case "ReasoningOutput":
        case "BuilderVerdict":
        case "OperatorVerdict":
          return JSON.stringify({
            result: "No material blocker",
            reasoning: "The stated queue protocol preserves sequence.",
            confidence: 0.05,
          });
        case "SteelManVerdict":
          return JSON.stringify({
            status: "survived",
            reasoning: "No review found a credible ordering blocker.",
          });
        case "StrategicConsequenceOutput":
          return JSON.stringify({
            impact: "low",
            recommended_change: "Track queue ordering during rollout.",
          });
        case "CaseVerdictOutput":
          return JSON.stringify({
            decision_state: "proceed",
            headline: "Proceed with the queue",
            summary: "The sequence claim survived the panel.",
          });
        default:
          throw new Error(`Unexpected Crossfire schema ${title}`);
      }
    },
  };
  const signal = AbortSignal.timeout(7000);
  const claims = await engine.extract(provider, proposal, signal);
  assert.equal(claims.length, 1);
  assert.equal(
    claims[0].text,
    "The queue preserves the order of invoice exports.",
  );
  assert.ok(claims[0].crossfire?.agents.includes("builder"));
  const events: ReviewEvent[] = [];
  const report = await engine.review(
    provider,
    { proposal, claims },
    (event) => events.push(event),
    signal,
  );
  assert.equal(report.model, "fixture-model");
  assert.equal(report.crossfireDecision, "Proceed");
  assert.equal(report.findings[0].verdict, "Survived");
  assert.equal(report.findings[0].claim.id, claims[0].id);
  assert.equal(report.findings[0].claim.loadBearing, true);
  assert.equal(report.findings[0].audit?.length, 3);
  for (const role of [
    "LoadBearingRanking",
    "ReasoningOutput",
    "BuilderVerdict",
    "OperatorVerdict",
    "SteelManVerdict",
    "CaseVerdictOutput",
  ])
    assert.ok(seen.has(role), role);
  assert.ok(
    events.some(
      (event) =>
        event.type === "progress" &&
        event.stage === "Feasibility" &&
        event.claimId === claims[0].id,
    ),
  );
});

test("the input gate returns Crossfire’s clarification wording", async () => {
  const prompt =
    "Which part of the launch are you deciding whether to commit to?";
  const seen: string[] = [];
  const provider: ReviewProvider = {
    async structured() {
      throw new Error("Legacy extraction should never be used.");
    },
    async research() {
      throw new Error("Clarification does not require web search.");
    },
    async crossfireGenerate(_instructions, _messages, schema) {
      const { title } = schema as { title: string };
      seen.push(title);
      return title === "ExtractedClaims"
        ? JSON.stringify({ testable: false, redirect: "Name a decision." })
        : JSON.stringify({
            clarifying_question: prompt,
            missing: ["the launch decision"],
          });
    },
  };
  await assert.rejects(
    engine.extract(
      provider,
      "We want to do something about our launch.",
      AbortSignal.timeout(4000),
    ),
    { message: prompt },
  );
  assert.deepEqual(seen, ["ExtractedClaims", "RecoveryResult"]);
});
