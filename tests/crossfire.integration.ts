import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";
import { toMarkdown } from "../shared/review.ts";
import { reviewModelSchema } from "../shared/models.ts";
import test from "node:test";
import {
  createCrossfireEngine,
  CrossfireClarification,
  CrossfireRuntimeError,
} from "../server/crossfire-engine.ts";
import {
  CrossfireStartupError,
  crossfireRuntime,
  verifyCrossfireRuntime,
} from "../server/crossfire-runtime.ts";
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

  const source = "https://docs.example.invalid/queue";
  const passage =
    "The invoice queue preserves ordering within each partition. Workers can finish at different times across partitions.";
  const selected = reviewModelSchema.options;
  const accessed = new Set<string>();
  let searches = 0;
  let quota = false;
  let failSynthesis = false;
  const token =
    "fixture." +
    Buffer.from(
      JSON.stringify({ session_id: "717a78cf-627d-4df6-9cbf-2cecafaa8052" }),
    ).toString("base64url") +
    ".fixture";
  const key = "synthetic-crossfire-fixture";
  const mockEngine = createCrossfireEngine(
    process.env.TACTILE_PYTHON,
    process.env.RENDER === "true",
    async (url) => {
      assert.equal(url, source);
      return { text: passage };
    },
  );
  await mockEngine.checkRuntime();
  const app = createApp(undefined, {
    auth: { url: "https://auth.example.invalid", publishableKey: "fixture" },
    crossfire: mockEngine,
    verifySession: async (value) => (value === token ? "test-account" : null),
    reserveUsage: async () => quota,
    metaRequest: async (url, init) => {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer " + key,
      );
      if (url === "https://api.meta.ai/v1/models") {
        assert.equal(init?.method, "GET");
        assert.equal(init?.body, undefined);
        return Response.json({
          object: "list",
          data: selected.map((id) => ({ id })),
        });
      }
      assert.equal(url, "https://api.meta.ai/v1/responses");
      const request = JSON.parse(String(init?.body));
      assert.equal(request.store, false);
      assert.ok(selected.includes(request.model));
      accessed.add(request.model);
      const emit = (text: string, annotations: object[] = []) =>
        Response.json({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text, annotations }],
            },
          ],
        });
      if (request.tools) {
        assert.equal(request.tools[0].type, "web_search");
        assert.equal(request.max_tool_calls, 1);
        searches++;
        return emit(passage, [
          {
            type: "url_citation",
            url: source,
            title: "Fixture queue documentation",
            start_index: 0,
            end_index: 51,
          },
        ]);
      }
      const format = request.text.format;
      assert.equal(format.type, "json_schema");
      assert.equal(format.strict, false);
      const title = format.schema.title;
      if (failSynthesis && title === "CaseVerdictOutput")
        return new Response(key, {
          status: 429,
          headers: { "Retry-After": "17" },
        });
      if (title === "ResearcherAssessment")
        return emit(
          JSON.stringify({
            result: "The fixture documents ordering per partition",
            reasoning: passage,
            confidence: 0,
            contradiction: null,
            cited: [{ source_url: source, stance: "supports", tier: 1 }],
          }),
        );
      const messages = request.input.map(
        ({
          role,
          content,
        }: {
          role: "user" | "assistant";
          content: { text: string }[];
        }) => ({ role, content: content[0].text }),
      );
      return emit(
        await provider.crossfireGenerate!(
          request.instructions,
          messages,
          format.schema,
          AbortSignal.timeout(1000),
        ),
      );
    },
  });
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  async function post(route: string, data: object) {
    return fetch(base + route, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    });
  }
  try {
    const anonymous = await fetch(base + "/api/status");
    assert.deepEqual(await anonymous.json(), { live: false });
    const status = await fetch(base + "/api/status", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.deepEqual(await status.json(), { live: false, workerReady: true });
    for (const [index, model] of selected.entries()) {
      quota = false;
      const save = await post(
        "/api/settings/provider",
        index === 0 ? { key, model } : { model },
      );
      assert.equal(
        save.status,
        index === 0 ? 201 : 200,
        await save.clone().text(),
      );
      assert.doesNotMatch(await save.text(), /synthetic-crossfire-fixture/);
      assert.equal((await post("/api/claims", { proposal })).status, 429);
      quota = true;
      const extraction = await post("/api/claims", {
        proposal,
        projectEvidence: [
          { id: "bench", title: "Benchmark", text: attachedText },
        ],
      });
      assert.equal(extraction.status, 200, await extraction.clone().text());
      const {
        claims: [claim],
      } = await extraction.json();
      const input = {
        proposal,
        claims: [
          {
            ...claim,
            text: "The invoice queue documentation says ordering is preserved within each partition.",
            risk: "evidence",
          },
        ],
        reviewers: ["builder", "researcher"],
      };
      const review = await post("/api/reviews", input);
      assert.equal(review.status, 200);
      const events = (await review.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as ReviewEvent);
      assert.ok(events.some((event) => event.type === "progress"));
      const finish = events.at(-1);
      assert.ok(finish?.type === "report", JSON.stringify(finish));
      assert.equal(finish.report.model, model);
      assert.deepEqual(finish.report.crossfireReviewers, [
        "builder",
        "researcher",
      ]);
      assert.ok(
        finish.report.sources.some(
          (item) => item.url === source && item.passage,
        ),
        JSON.stringify(finish.report.findings),
      );
      const memo = toMarkdown(proposal, finish.report);
      assert.ok(
        memo
          .split("\n")
          .includes(`- [Fixture queue documentation](<${source}>)`),
      );
      assert.doesNotMatch(memo, /synthetic-crossfire-fixture/);
      if (index === 0) {
        failSynthesis = true;
        const failed = await post("/api/reviews", input);
        assert.equal(failed.status, 200);
        const stream = await failed.text();
        assert.doesNotMatch(stream, /synthetic-crossfire-fixture/);
        const errorEvents = stream
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as ReviewEvent);
        assert.ok(errorEvents.some(({ type }) => type === "progress"));
        assert.deepEqual(errorEvents.at(-1), {
          type: "error",
          code: "provider_rate_limit",
          message:
            "The provider reached a usage or billing limit. Wait before trying again and check provider usage if it persists.",
          retryAfter: "17",
          upstreamStatus: 429,
        });
        failSynthesis = false;
      }
    }
    assert.deepEqual([...accessed], [...selected]);
    assert.ok(searches > 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
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

test("Crossfire subprocess exit is distinguishable from a provider failure", async () => {
  const brokenEngine = createCrossfireEngine(process.execPath);
  await assert.rejects(
    () => brokenEngine.checkRuntime(),
    CrossfireStartupError,
  );
  const provider = createProvider(
    "synthetic-key",
    "fixture",
    async () => {
      throw new Error("Unexpected provider call");
    },
    "meta",
  );
  await assert.rejects(
    () => brokenEngine.extract(provider, proposal, AbortSignal.timeout(8_000)),
    CrossfireRuntimeError,
  );
});

test("Crossfire readiness accepts delayed JSON and reports bounded startup failures", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tactile-worker-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtime = crossfireRuntime(
    process.env.TACTILE_PYTHON,
    process.env.RENDER === "true",
  );
  const worker = join(directory, "worker.py");
  const fixture = { ...runtime, worker };
  const missingTarget = join(directory, "missing-deps");
  const emptyTarget = join(directory, "empty-deps");
  await mkdir(emptyTarget);

  await assert.rejects(
    verifyCrossfireRuntime({
      ...runtime,
      executable: join(directory, "missing-python"),
    }),
    {
      message: "python_not_found",
    },
  );
  await assert.rejects(
    verifyCrossfireRuntime({ ...runtime, dependencies: missingTarget }),
    {
      message: "dependency_target_missing",
    },
  );
  await assert.rejects(
    verifyCrossfireRuntime({ ...runtime, dependencies: emptyTarget }),
    {
      message: "missing_module",
    },
  );

  await writeFile(
    worker,
    'import time; time.sleep(5.4); print(\'{\\n  "kind": "ready"\\n}\')\n',
  );
  await assert.rejects(verifyCrossfireRuntime(fixture, 100), {
    message: "timeout",
  });
  assert.ok((await verifyCrossfireRuntime(fixture)).elapsedMs >= 5_000);

  await writeFile(
    worker,
    'print("unexpected output")\nprint(\'{"kind":"ready"}\')\n',
  );
  await assert.rejects(verifyCrossfireRuntime(fixture), {
    message: "invalid_handshake",
  });
  await writeFile(worker, "raise SystemExit(7)\n");
  await assert.rejects(verifyCrossfireRuntime(fixture), (error: unknown) => {
    assert.ok(error instanceof CrossfireStartupError);
    assert.equal(error.diagnostic.reason, "nonzero_exit");
    assert.equal(error.diagnostic.exitCode, 7);
    return true;
  });

  for (const [exception, reason] of [
    ["ModuleNotFoundError", "missing_module"],
    ["ImportError", "import_failed"],
  ]) {
    await writeFile(
      worker,
      `
import asyncio
import sys
async def run(_command):
    raise ${exception}("synthetic private diagnostic")
if __name__ == "__main__":
    try:
        asyncio.run(run({}))
    except ImportError:
        print('{"kind":"error"}')
        print("synthetic private diagnostic", file=sys.stderr)
        sys.exit(1)
`,
    );
    await assert.rejects(verifyCrossfireRuntime(fixture), (error: unknown) => {
      assert.ok(error instanceof CrossfireStartupError);
      assert.equal(error.diagnostic.reason, reason);
      assert.equal(error.diagnostic.exitCode, 1);
      assert.doesNotMatch(
        JSON.stringify(error),
        /synthetic private diagnostic/,
      );
      return true;
    });
  }
  await engine.checkRuntime();
});

test("canceling Crossfire aborts the provider request already in flight", async () => {
  const controller = new AbortController();
  let canceled = false;
  const provider = createProvider(
    "synthetic-key",
    "muse-spark-1.3",
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const sent = init?.signal;
        assert.ok(sent);
        sent.addEventListener(
          "abort",
          () => {
            canceled = true;
            reject(sent.reason);
          },
          { once: true },
        );
        controller.abort(new Error("Canceled fixture review"));
      }),
    "meta",
  );
  await assert.rejects(
    engine.extract(
      provider,
      proposal,
      AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    ),
    /Canceled fixture review/,
  );
  assert.equal(canceled, true);
});
