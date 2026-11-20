import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../server/app.ts";
import { createProvider } from "../server/provider.ts";
import { runReview } from "../server/pipeline.ts";
import { demoClaims, demoProposal } from "../shared/demo.ts";
import { reviewEventSchema } from "../shared/review.ts";
import type { ReviewEvent } from "../shared/review.ts";

const input = { proposal: demoProposal, claims: demoClaims.slice(0, 2) };
const signal = new AbortController().signal;
const citation = {
  type: "url_citation",
  url: "https://example.com/source",
  title: "Fixture source",
};

function success(text: string, annotations: unknown[] = []) {
  return Response.json({
    status: "completed",
    output: [{ content: [{ type: "output_text", text, annotations }] }],
  });
}

function mockProvider(
  options: {
    wrongCitation?: boolean;
    conflict?: boolean;
    malformed?: boolean;
    searchDown?: boolean;
  } = {},
) {
  return createProvider("fixture", "fixture", async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    if (body.tools) {
      if (options.searchDown) return new Response(null, { status: 503 });
      return success(
        "Fixture: two sources conflict; applicability is uncertain.",
        [citation, { ...citation, url: "javascript:example" }],
      );
    }
    if (body.instructions.includes("Identify one to six")) {
      return success(
        JSON.stringify({
          claims: ["One concrete assumption.", "One concrete assumption."],
        }),
      );
    }
    if (body.instructions.includes("Adjudicate")) {
      if (options.malformed) return success("{ malformed");
      return success(
        JSON.stringify({
          recommendation: "Check before rollout.",
          findings: input.claims.map(({ id }, index) => ({
            id,
            verdict: options.conflict ? "Unresolved" : "Supported",
            rationale: options.conflict
              ? "The sources conflict."
              : "This mock has evidence.",
            nextStep: "Run a shadow test.",
            sourceIds: [
              options.wrongCitation ? "unknown" : `source-${index + 1}-1`,
            ],
          })),
        }),
      );
    }
    return success(
      JSON.stringify({
        findings: input.claims.map(({ id }) => ({
          id,
          observation: "Check the dependency graph.",
        })),
      }),
    );
  });
}

test("provider citation parsing keeps only valid URLs and parallel stages precede synthesis", async () => {
  const events: ReviewEvent[] = [];
  const report = await runReview(
    mockProvider(),
    input,
    (event) => events.push(event),
    signal,
  );
  assert.deepEqual(
    report.findings.map(({ verdict }) => verdict),
    ["Supported", "Supported"],
  );
  assert.deepEqual(
    report.findings.map(({ sourceIds }) => sourceIds),
    [["source-1-1"], ["source-2-1"]],
  );
  assert.equal(report.sources.length, 2);
  assert.ok(report.sources.every(({ url }) => url.startsWith("https://")));
  assert.deepEqual(
    events.slice(0, 3).map((event) => event.type === "progress" && event.stage),
    ["Assumptions", "Feasibility", "Evidence"],
  );
  const last = events.at(-1);
  assert.equal(last?.type === "progress" && last.stage, "Synthesis");
});

for (const condition of [
  "wrongCitation",
  "conflict",
  "malformed",
  "searchDown",
] as const) {
  test(`live review remains unresolved for ${condition}`, async () => {
    const report = await runReview(
      mockProvider({ [condition]: true }),
      input,
      () => {},
      signal,
    );
    assert.ok(report.findings.every(({ verdict }) => verdict === "Unresolved"));
    assert.match(report.recommendation, /Resolve the open claims/);
    if (condition !== "conflict") assert.deepEqual(report.sources, []);
  });
}

async function withServer(
  app: ReturnType<typeof createApp>,
  run: (url: string) => Promise<void>,
) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function post(url: string, body: object, signal?: AbortSignal) {
  return fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    signal,
  });
}

test("live HTTP endpoints return extracted claims and a validated NDJSON report", async () => {
  await withServer(createApp(mockProvider()), async (url) => {
    const status = await fetch(url + "/api/status");
    assert.deepEqual(await status.json(), { live: true });
    const claims = await post(url + "/api/claims", { proposal: demoProposal });
    assert.equal(claims.status, 200);
    assert.deepEqual(await claims.json(), {
      claims: [{ id: "claim-1", text: "One concrete assumption." }],
    });
    const invalid = await post(url + "/api/reviews", { ...input, claims: [] });
    assert.equal(invalid.status, 400);
    const response = await post(url + "/api/reviews", input);
    assert.match(
      response.headers.get("content-type") ?? "",
      /application\/x-ndjson/,
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => reviewEventSchema.parse(JSON.parse(line)));
    assert.equal(events.at(-1)?.type, "report");
  });
});

test("client cancellation reaches in-flight provider work and the same input can be retried", async () => {
  let stalled = true;
  let observeAbort: () => void = () => {};
  const observed = new Promise<void>((resolve) => {
    observeAbort = resolve;
  });
  const provider = mockProvider();
  await withServer(
    createApp({
      ...provider,
      structured(instructions, data, schema, signal) {
        if (!stalled)
          return provider.structured(instructions, data, schema, signal);
        return new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              observeAbort();
              reject(signal.reason);
            },
            { once: true },
          );
        });
      },
    }),
    async (url) => {
      const controller = new AbortController();
      const response = await post(
        url + "/api/reviews",
        input,
        controller.signal,
      );
      assert.equal(response.status, 200);
      const reader = response.body?.getReader();
      await reader?.read();
      controller.abort();
      await Promise.race([
        observed,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("No provider abort observed.")),
            2_000,
          ).unref();
        }),
      ]);
      stalled = false;
      const retry = await post(url + "/api/reviews", input);
      assert.match(await retry.text(), /"type":"report"/);
    },
  );
});

test("no-key HTTP mode avoids provider calls", async () => {
  await withServer(createApp(), async (url) => {
    const status = await fetch(url + "/api/status");
    assert.deepEqual(await status.json(), { live: false });
    const response = await post(url + "/api/claims", {
      proposal: demoProposal,
    });
    assert.equal(response.status, 503);
  });
});
