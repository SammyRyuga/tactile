import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { z } from "zod";
import { createApp } from "../server/app.ts";
import { createProvider } from "../server/provider.ts";
import { runReview } from "../server/pipeline.ts";
import { demoClaims, demoProposal } from "../shared/demo.ts";
import { reviewEventSchema } from "../shared/review.ts";
import type { ReviewEvent } from "../shared/review.ts";

const input = { proposal: demoProposal, claims: demoClaims.slice(0, 2) };
const signal = new AbortController().signal;
const sourceReader = async () =>
  "Fetched page with text independent of the provider response.";
const citation = {
  type: "url_citation",
  url: "https://example.com/source",
  title: "Fixture source",
  start_index: 0,
  end_index: 15,
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
    unrelated?: boolean;
    wrongMechanism?: boolean;
    fabricatedSourceQuote?: boolean;
    repeatedCitations?: boolean;
    nonEntailingPremise?: boolean;
    shortPremise?: boolean;
    noBreak?: boolean;
    missingFacts?: boolean;
    internal?: boolean;
    inventedQuote?: boolean;
  } = {},
) {
  return createProvider("fixture", "fixture", async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    if (body.tools) {
      if (options.searchDown) return new Response(null, { status: 503 });
      return success(
        "Fixture: two sources conflict; applicability is uncertain.",
        [
          citation,
          ...(options.repeatedCitations
            ? [
                citation,
                {
                  ...citation,
                  url: citation.url + "?utm_source=model#install",
                },
                { ...citation, url: citation.url + "?version=2" },
              ]
            : []),
          { ...citation, url: "javascript:example" },
        ],
      );
    }
    if (body.instructions.includes("Identify one to six")) {
      return success(
        JSON.stringify({
          scope: "engineering",
          explanation: "",
          claims: [
            {
              text: "One concrete assumption.",
              risk: "technical",
              loadBearing: true,
            },
            {
              text: "One concrete assumption.",
              risk: "technical",
              loadBearing: true,
            },
          ],
        }),
      );
    }
    if (body.instructions.includes("Assess each research excerpt")) {
      const { passages, premises } = JSON.parse(body.input);
      assert.ok(
        passages.every(({ passage }: { passage: string }) =>
          options.wrongMechanism
            ? passage.includes("database page")
            : passage.startsWith("Fetched page"),
        ),
      );
      return success(
        JSON.stringify({
          premises: premises.map(
            ({ id, quote }: { id: string; quote: string }) => ({
              id,
              quote,
              entailsConcern: !options.nonEntailingPremise,
              explanation: "Fixture premise check.",
            }),
          ),
          judgments: passages.map(
            ({ id, passage }: { id: string; passage: string }) => ({
              id,
              relation: options.wrongMechanism
                ? "contradicts"
                : options.unrelated
                  ? "unrelated"
                  : "supports",
              applicability: options.wrongMechanism
                ? "different mechanism"
                : options.unrelated
                  ? "background"
                  : "direct",
              quote: options.fabricatedSourceQuote
                ? "An invented quotation from the verifier."
                : passage,
              explanation: "Fixture verification.",
            }),
          ),
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
            verdict: options.conflict
              ? "Unresolved"
              : options.internal || options.wrongMechanism
                ? "Contradicted"
                : options.noBreak
                  ? "No credible break found"
                  : "Supported",
            rationale: options.conflict
              ? "The sources conflict."
              : "This mock has evidence.",
            nextStep: "Run a shadow test.",
            reason: options.conflict ? "Sources conflict" : null,
            missingInformation: options.conflict
              ? "A reconciled measurement."
              : options.missingFacts
                ? "Actual measurements."
                : null,
            proposalExcerpt: options.internal
              ? "a shared schema package consumed by checkout and reporting"
              : null,
            minimalFix: options.internal
              ? "Keep affected consumers in scope."
              : null,
            tradeoff: options.internal ? "Longer checks." : null,
            sourceIds:
              options.internal || options.noBreak
                ? []
                : [options.wrongCitation ? "unknown" : `source-${index + 1}-1`],
          })),
        }),
      );
    }
    return success(
      JSON.stringify({
        findings: input.claims.map(({ id }) => ({
          id,
          outcome: options.internal ? "concern" : "no credible concern",
          observation: options.internal
            ? "A shared schema can affect its consumers."
            : "No credible failure found within the fixture.",
          proposalExcerpt: options.inventedQuote
            ? "This text does not appear in the proposal."
            : options.shortPremise
              ? "a shared schema"
              : options.internal
                ? "a shared schema package consumed by checkout and reporting"
                : null,
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
    { sourceReader },
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
  assert.ok(
    events.some(
      (event) =>
        event.type === "progress" &&
        event.stage === "Verification" &&
        event.status === "done",
    ),
  );
  assert.ok(
    report.findings[0].audit?.some(({ observation }) =>
      observation.includes("no credible concern"),
    ),
  );
  const last = events.at(-1);
  assert.equal(last?.type === "progress" && last.stage, "Synthesis");
});

for (const condition of [
  "wrongCitation",
  "conflict",
  "malformed",
  "searchDown",
  "unrelated",
] as const) {
  test(`live review remains unresolved for ${condition}`, async () => {
    const report = await runReview(
      mockProvider({ [condition]: true }),
      input,
      () => {},
      signal,
      { sourceReader },
    );
    assert.ok(report.findings.every(({ verdict }) => verdict === "Unresolved"));
    assert.equal(
      report.findings[0].reason,
      condition === "malformed" || condition === "searchDown"
        ? "Check failed"
        : condition === "conflict"
          ? "Sources conflict"
          : "Evidence insufficient",
    );
    assert.ok(report.findings[0].audit?.length);
    if (condition !== "malformed")
      assert.equal(report.recommendation, "Check before rollout.");
  });
}

test("repeat citations collapse per claim before verification while distinct query variants survive", async () => {
  const report = await runReview(
    mockProvider({ repeatedCitations: true }),
    input,
    () => {},
    signal,
    { sourceReader },
  );
  const audited = report.findings[0].audit?.find(
    ({ stage }) => stage === "Evidence",
  )?.sourceIds;
  assert.deepEqual(audited, ["source-1-1", "source-1-2"]);
  assert.deepEqual(
    report.sources.slice(0, 2).map(({ url }) => url),
    [citation.url, citation.url + "?version=2"],
  );
});

test("a different failure mechanism cannot contradict a claim even with a real quote", async () => {
  const report = await runReview(
    mockProvider({ wrongMechanism: true }),
    {
      proposal:
        "The importer overwrites existing order records in place. The application has no undo job or backup.",
      claims: [
        {
          ...input.claims[0],
          text: "Overwritten order records can be rebuilt without retained prior versions.",
        },
      ],
    },
    () => {},
    signal,
    {
      sourceReader: async () =>
        "A corrupted Db2 database page can be restored from a good backup.",
    },
  );
  assert.equal(report.findings[0].verdict, "Unresolved");
  assert.deepEqual(report.findings[0].sourceIds, []);
  assert.equal(report.sources[0].relation, "unrelated");
});

test("a verdict cannot use a fabricated verifier quote", async () => {
  const report = await runReview(
    mockProvider({ fabricatedSourceQuote: true }),
    input,
    () => {},
    signal,
    { sourceReader },
  );
  assert.equal(report.findings[0].verdict, "Unresolved");
  assert.equal(report.sources[0].relation, "unrelated");
});

test("proposal-derived contradiction and repair survive search failure", async () => {
  const report = await runReview(
    mockProvider({ internal: true, searchDown: true }),
    input,
    () => {},
    signal,
  );
  assert.equal(report.findings[0].basis, "proposal");
  assert.equal(report.findings[0].verdict, "Contradicted");
  assert.ok(report.findings[0].repair);
  assert.ok(
    report.findings[0].audit?.some(
      ({ stage, status }) => stage === "Evidence" && status === "failed",
    ),
  );
  const invented = await runReview(
    mockProvider({ internal: true, inventedQuote: true, searchDown: true }),
    input,
    () => {},
    signal,
  );
  assert.equal(invented.findings[0].verdict, "Unresolved");
});

test("an exact proposal quote must be substantive and entail the concern", async () => {
  for (const condition of ["nonEntailingPremise", "shortPremise"] as const) {
    const report = await runReview(
      mockProvider({ internal: true, searchDown: true, [condition]: true }),
      input,
      () => {},
      signal,
    );
    assert.equal(report.findings[0].verdict, "Unresolved");
    assert.equal(report.findings[0].basis, undefined);
  }
});

test("no credible break is distinct from positive support and requires completed checks", async () => {
  const run = (options: Parameters<typeof mockProvider>[0]) =>
    runReview(
      mockProvider({ noBreak: true, ...options }),
      input,
      () => {},
      signal,
      { sourceReader },
    );
  assert.equal((await run({})).findings[0].verdict, "No credible break found");
  assert.equal(
    (await run({ missingFacts: true })).findings[0].verdict,
    "Unresolved",
  );
  assert.equal(
    (await run({ searchDown: true })).findings[0].verdict,
    "Unresolved",
  );
});

test("HTTP and fetch diagnostics persist on unverified sources", async () => {
  const report = await runReview(mockProvider(), input, () => {}, signal, {
    sourceReader: async () => ({ status: 403, reason: "HTTP response" }),
  });
  assert.match(report.sources[0].diagnostic ?? "", /HTTP 403/);
  assert.match(
    report.findings[0].audit?.find(({ stage }) => stage === "Verification")
      ?.observation ?? "",
    /HTTP 403/,
  );
});

test("unreadable citations cannot support a verdict", async () => {
  const report = await runReview(mockProvider(), input, () => {}, signal, {
    sourceReader: async () => undefined,
  });
  assert.equal(report.findings[0].verdict, "Unresolved");
  assert.equal(report.sources[0].passage, undefined);
  assert.equal(report.sources[0].relation, undefined);
});

test("arithmetic decides an explicit mismatch even when synthesis fails", async () => {
  const report = await runReview(
    mockProvider({ malformed: true }),
    {
      ...input,
      claims: [
        { id: "math", risk: "logic", text: "(1,000 + 500) × 2 = 2,500" },
      ],
    },
    () => {},
    signal,
  );
  assert.equal(report.findings[0].basis, "arithmetic");
  assert.equal(report.findings[0].verdict, "Contradicted");
  assert.match(report.findings[0].rationale, /3000/);
  assert.ok(
    report.findings[0].audit?.some(
      ({ stage, status }) => stage === "Evidence" && status === "skipped",
    ),
  );
});

test("review input cannot expand the server search budget", async () => {
  const report = await runReview(
    mockProvider(),
    {
      ...input,
      claims: [
        ...input.claims,
        { ...input.claims[1], id: "extra", loadBearing: true },
      ],
    },
    () => {},
    signal,
    { sourceReader },
  );
  assert.equal(
    report.findings.filter(({ claim }) => claim.loadBearing).length,
    1,
  );
});

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
  await withServer(createApp(mockProvider(), { sourceReader }), async (url) => {
    const status = await fetch(url + "/api/status");
    assert.deepEqual(await status.json(), { live: true });
    const claims = await post(url + "/api/claims", { proposal: demoProposal });
    assert.equal(claims.status, 200);
    assert.deepEqual(await claims.json(), {
      claims: [
        {
          id: "claim-1",
          text: "One concrete assumption.",
          risk: "technical",
          loadBearing: true,
        },
      ],
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
    createApp(
      {
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
      },
      { sourceReader },
    ),
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

test("hosted live endpoints require a verified session and limit each account", async () => {
  let verified = 0;
  await withServer(
    createApp(mockProvider(), {
      verifySession: async (token) => {
        verified++;
        return token === "valid" ? "account-1" : null;
      },
    }),
    async (url) => {
      const submit = (token?: string) =>
        fetch(url + "/api/claims", {
          method: "POST",
          body: JSON.stringify({ proposal: demoProposal }),
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
      assert.equal((await submit()).status, 401);
      assert.equal(verified, 0);
      assert.equal((await submit("invalid")).status, 401);
      for (let i = 0; i < 12; i++) {
        const response = await submit("valid");
        assert.equal(response.status, 200);
        await response.json();
      }
      assert.equal((await submit("valid")).status, 429);
    },
  );
});

test("personal keys require authentication, stay scoped to the sign-in session, and are never echoed", async () => {
  const accessToken = (id: string) =>
    `header.${Buffer.from(JSON.stringify({ session_id: id })).toString("base64url")}.signature`;
  const token = accessToken("10000000-0000-4000-8000-000000000001");
  const otherSession = accessToken("10000000-0000-4000-8000-000000000002");
  const key = "synthetic-test-key-value";
  await withServer(
    createApp(undefined, {
      verifySession: async (value) =>
        [token, otherSession].includes(value) ? "test-account" : null,
    }),
    async (url) => {
      const endpoint = url + "/api/settings/provider";
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      assert.equal((await fetch(endpoint)).status, 401);
      assert.equal((await post(url + "/api/reviews", input)).status, 401);
      const saved = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ key }),
      });
      assert.equal(saved.status, 201);
      assert.doesNotMatch(await saved.text(), /synthetic-test-key-value/);
      assert.deepEqual(
        await (await fetch(url + "/api/status", { headers })).json(),
        { live: true },
      );
      assert.deepEqual(
        await (
          await fetch(endpoint, {
            headers: { Authorization: `Bearer ${otherSession}` },
          })
        ).json(),
        { saved: false },
      );
      assert.equal(
        (await fetch(endpoint, { method: "DELETE", headers })).status,
        200,
      );
      assert.deepEqual(await (await fetch(endpoint, { headers })).json(), {
        saved: false,
      });
    },
  );
});

test("Meta research calls Meta's Responses API with its search format", async () => {
  const provider = createProvider(
    "synthetic-test-key",
    "muse-spark-1.3",
    async (url, init) => {
      assert.equal(url, "https://api.meta.ai/v1/responses");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "muse-spark-1.3");
      assert.equal(body.store, false);
      assert.deepEqual(body.reasoning, { effort: "medium" });
      assert.deepEqual(body.tools, [
        { type: "web_search", search_context_size: "high" },
      ]);
      assert.equal("max_tool_calls" in body, false);
      return success("A cited statement with enough context.", [citation]);
    },
    "meta",
  );
  const result = await provider.research(
    "Find documentation.",
    { claim: "Test claim" },
    signal,
    { maxToolCalls: 3 },
  );
  assert.equal(result.citations.length, 1);
});

test("Meta verification uses its own override and strict structured output", async () => {
  const provider = createProvider(
    "synthetic-test-key",
    "muse-spark-1.3",
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "muse-ember-1.0");
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.deepEqual(body.reasoning, { effort: "low" });
      return success("{}");
    },
    "meta",
    { verifierModel: "muse-ember-1.0" },
  );
  await provider.structured("Verify a passage.", {}, z.object({}), signal, {
    model: "gpt-5-mini",
  });
});
