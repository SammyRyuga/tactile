import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  createCrossfireEngine,
  CrossfireClarification,
} from "../server/crossfire-engine.ts";
import type { ReviewProvider } from "../server/provider.ts";
import { createProvider, ProviderResponseError } from "../server/provider.ts";
import type { ReviewEvent } from "../shared/review.ts";

const engine = createCrossfireEngine(
  process.env.TACTILE_PYTHON,
  process.env.RENDER === "true",
);
const proposal = "Switch invoice exports to a queue with independent workers.";

test("the pinned Crossfire engine extracts, ranks, tests, and reconciles through the Tactile gateway", async () => {
  const seen = new Set<string>();
  const attachedText =
    "Staging reproduced the queue ordering at 20 jobs per second.";
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
          assert.ok(messages[0].content.includes(attachedText));
          return JSON.stringify({
            statements: [
              "The queue preserves the order of invoice exports.",
              "A worker can process the queued export.",
              "The export completion state is visible in the workspace.",
              "Workers can pause during maintenance.",
              "A failed export can be retried by an operator.",
            ],
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
            ranked_indices: [1, 2, 3, 4, 5],
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
  const claims = await engine.extract(provider, proposal, signal, {
    projectEvidence: [{ id: "bench", title: "Benchmark", text: attachedText }],
  });
  assert.equal(claims.length, 5);
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
  assert.deepEqual(report.crossfireReviewers, [
    "devils_advocate",
    "builder",
    "operator",
  ]);
  const focused = await engine.review(
    provider,
    { proposal, claims: [claims[0]], reviewers: ["builder"] },
    () => {},
    AbortSignal.timeout(4000),
  );
  assert.deepEqual(focused.crossfireReviewers, ["builder"]);
  assert.deepEqual(
    focused.findings[0].audit?.map(({ stage }) => stage),
    ["Feasibility"],
  );

  assert.equal(report.crossfireDecision, "Proceed");
  assert.equal(report.findings[0].verdict, "Survived");
  assert.deepEqual(
    report.findings.map(({ claim }) => claim.id),
    claims.map(({ id }) => id),
  );
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
            provisional_claims: ["The launch can be phased."],
          });
    },
  };
  await assert.rejects(
    engine.extract(
      provider,
      "We want to do something about our launch.",
      AbortSignal.timeout(4000),
    ),
    (error: unknown) => {
      assert.ok(error instanceof CrossfireClarification);
      assert.equal(error.message, prompt);
      assert.deepEqual(error.details.missing, ["the launch decision"]);
      assert.equal(
        error.details.suggestions?.[0].text,
        "The launch can be phased.",
      );
      return true;
    },
  );
  assert.deepEqual(seen, ["ExtractedClaims", "RecoveryResult"]);
});

test("Crossfire reads digital PDFs, screenshots and scanned PDFs", async () => {
  const fixtures = spawnSync(
    process.env.TACTILE_PYTHON ?? ".venv/bin/python",
    [
      "-c",
      String.raw`
import base64, io, json
import pymupdf
from PIL import Image, ImageDraw, ImageFont

text = "Keep backups for rollback."
digital = pymupdf.open()
digital.new_page().insert_text((30, 50), text, fontsize=20)
image = Image.new("RGB", (900, 190), "white")
ImageDraw.Draw(image).text((34, 55), text, font=ImageFont.load_default(size=46), fill="black")
data = io.BytesIO()
image.save(data, format="PNG")
scan = pymupdf.open()
page = scan.new_page(width=900, height=190)
page.insert_image(page.rect, stream=data.getvalue())
print(json.dumps([base64.b64encode(item).decode("ascii") for item in (
    digital.tobytes(), data.getvalue(), scan.tobytes(),
)]))
`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(fixtures.status, 0, fixtures.stderr);
  const [digital, image, scanned] = (
    JSON.parse(fixtures.stdout) as string[]
  ).map((fixture) => Buffer.from(fixture, "base64"));
  const signal = AbortSignal.timeout(35_000);
  assert.equal(
    await engine.ingest("pdf", digital, signal),
    "Keep backups for rollback.",
  );
  assert.match(
    (await engine.ingest("image", image, signal)) ?? "",
    /rollback/i,
  );
  assert.match(
    (await engine.ingest("pdf", scanned, signal)) ?? "",
    /rollback/i,
  );
  assert.equal(
    await engine.ingest("image", Buffer.from("not an image"), signal),
    undefined,
  );
});

test("Crossfire applies selected Steelman fixes with its original rewrite method", async () => {
  const provider: ReviewProvider = {
    modelId: "fixture-model",
    async structured() {
      throw new Error("Legacy method should never be used.");
    },
    async research() {
      return { text: "", citations: [] };
    },
    async crossfireGenerate(_instructions, messages, schema) {
      assert.equal(
        (schema as { title: string }).title,
        "ReformulatedPromptOutput",
      );
      assert.match(messages[0].content, /Keep a backup until rollout ends/);
      return JSON.stringify({
        improved_prompt:
          "Keep a backup until rollout ends, then delete old exports.",
      });
    },
  };
  const revised = await engine.revise(
    provider,
    {
      proposal: "Delete old invoice exports before the rollout.",
      changes: [
        {
          id: "export",
          claim: "Delete old invoice exports before the rollout.",
          salvage: "Keep a backup until rollout ends.",
        },
      ],
    },
    AbortSignal.timeout(8000),
  );
  assert.match(revised.proposal, /^Keep a backup/);
});

test("SEC-02 · Crossfire stops on provider quota and preserves the retry delay", async () => {
  let calls = 0;
  const provider = createProvider(
    "synthetic-key",
    "test",
    async () => {
      calls += 1;
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "17" },
      });
    },
    "meta",
  );
  await assert.rejects(
    () => engine.extract(provider, proposal, AbortSignal.timeout(10_000)),
    (error: unknown) =>
      error instanceof ProviderResponseError &&
      error.status === 429 &&
      error.retryAfter === "17",
  );
  assert.equal(calls, 1);
});
