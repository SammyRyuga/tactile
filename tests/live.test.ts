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

const benchmarkQuote =
  "Checkout staging p95 was 128 ms under 500 requests per second.";

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
    crossClaimCitation?: boolean;
    conflict?: boolean;
    zeroCitations?: boolean;
    malformed?: boolean;
    searchDown?: boolean;
    unrelated?: boolean;
    wrongMechanism?: boolean;
    fabricatedSourceQuote?: boolean;
    repeatedCitations?: boolean;
    nonEntailingPremise?: boolean;
    shortPremise?: boolean;
    submittedEvidence?: "valid" | "fabricated" | "another-claim";
    noBreak?: boolean;
    missingFacts?: boolean;
    internal?: boolean;
    inventedQuote?: boolean;
    recoverQuote?: boolean;
    qualifies?: boolean;
    needsInformation?: boolean;
    misleadingRecommendation?: boolean;
    probe?: "verified" | "unrelated" | "private";
    inspect?: (request: {
      instructions: string;
      input: string;
      max_tool_calls?: number;
    }) => void;
  } = {},
) {
  return createProvider("fixture", "fixture", async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    options.inspect?.(body);
    if (body.tools) {
      assert.doesNotMatch(body.input, /Checkout staging p95 was 128 ms/);
      if (options.searchDown) return new Response(null, { status: 503 });
      if (body.instructions.includes("Cross-examine")) {
        return success("Follow-up fixture citation.", [
          { ...citation, url: citation.url + "/blocker" },
        ]);
      }
      return success(
        "Fixture: two sources conflict; applicability is uncertain.",
        options.zeroCitations
          ? []
          : [
              citation,
              ...(options.conflict
                ? [{ ...citation, url: citation.url + "/different" }]
                : []),
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
    if (body.instructions.includes("Verify private project evidence")) {
      const { pairs } = JSON.parse(body.input);
      return success(
        JSON.stringify({
          judgments: pairs.map(({ id }: { id: string }) => ({
            id,
            relation: "supports",
            quote:
              options.submittedEvidence === "fabricated"
                ? "An invented production measurement from the model."
                : benchmarkQuote,
            explanation:
              "The fixture matches the checkout load and percentile.",
          })),
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
              quote:
                quote ??
                (options.recoverQuote
                  ? "a shared schema package consumed by checkout and reporting"
                  : null),
              impact: options.nonEntailingPremise
                ? "insufficient"
                : options.qualifies
                  ? "qualifies"
                  : "contradicts",
              explanation: "Fixture premise check.",
            }),
          ),
          judgments: passages.map(
            ({ id, passage }: { id: string; passage: string }) => ({
              id,
              relation:
                options.probe === "verified" && id === "source-1-2"
                  ? "contradicts"
                  : (options.probe && id === "source-1-1") ||
                      (options.probe === "unrelated" && id === "source-1-2")
                    ? "unrelated"
                    : options.wrongMechanism ||
                        (options.conflict && id.endsWith("-2"))
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
          recommendation: options.misleadingRecommendation
            ? "Proceed immediately. The claims are proven."
            : "Check before rollout.",
          findings: input.claims.map(({ id }, index) => ({
            id,
            verdict: options.conflict
              ? "Unresolved"
              : options.internal ||
                  options.wrongMechanism ||
                  (options.probe && index === 0)
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
                : options.probe && index === 0
                  ? ["source-1-2"]
                  : options.submittedEvidence
                    ? [
                        options.submittedEvidence === "another-claim"
                          ? "project-2-1"
                          : `project-${index + 1}-1`,
                      ]
                    : [
                        options.wrongCitation
                          ? "unknown"
                          : options.crossClaimCitation
                            ? `source-${2 - index}-1`
                            : `source-${index + 1}-1`,
                      ],
          })),
        }),
      );
    }
    return success(
      JSON.stringify({
        findings: JSON.parse(body.input).claims.map(
          ({ id }: { id: string }) => ({
            id,
            publicBlocker:
              options.probe &&
              options.probe !== "private" &&
              id === input.claims[0].id
                ? "dependency schema changes invalidating affected package builds"
                : null,
            outcome:
              options.internal || options.probe
                ? "concern"
                : options.needsInformation
                  ? "needs information"
                  : "no credible concern",
            observation: options.probe
              ? "Private CheckoutTeam rollout logs may show an affected consumer."
              : options.internal
                ? "A shared schema can affect its consumers."
                : "No credible failure found within the fixture.",
            proposalExcerpt: options.recoverQuote
              ? null
              : options.inventedQuote
                ? "This text does not appear in the proposal."
                : options.shortPremise
                  ? "a shared schema"
                  : options.internal
                    ? "a shared schema package consumed by checkout and reporting"
                    : null,
          }),
        ),
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
  "crossClaimCitation",
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
    assert.match(report.recommendation, /Resolve the evidence gaps/);
  });
}

test("critical claims get the full independent panel and a verified, budgeted blocker probe", async () => {
  const requests: Array<{
    instructions: string;
    input: string;
    max_tool_calls?: number;
  }> = [];
  const report = await runReview(
    mockProvider({
      probe: "verified",
      inspect: (request) => requests.push(request),
    }),
    input,
    () => {},
    signal,
    { sourceReader },
  );
  const panel = requests.filter(({ instructions }) =>
    instructions.includes("Return one finding per assigned ID"),
  );
  assert.equal(panel.length, 4);
  assert.ok(
    panel.every(({ input: payload }) =>
      JSON.parse(payload).claims.some(
        ({ id }: { id: string }) => id === input.claims[0].id,
      ),
    ),
  );
  assert.ok(
    panel.every(({ input: payload }) =>
      JSON.parse(payload).claims.some(
        ({ id }: { id: string }) => id === input.claims[1].id,
      ),
    ),
  );
  const probes = requests.filter(({ instructions }) =>
    instructions.includes("Cross-examine"),
  );
  assert.equal(probes.length, 1);
  assert.equal(probes[0].max_tool_calls, 1);
  assert.deepEqual(JSON.parse(probes[0].input), {
    publicBlocker:
      "dependency schema changes invalidating affected package builds",
  });
  assert.equal(report.findings[0].verdict, "Contradicted");
  assert.equal(report.findings[0].basis, "source");
  assert.deepEqual(report.findings[0].sourceIds, ["source-1-2"]);
  assert.match(
    report.findings[0].audit?.find(({ stage }) => stage === "Evidence")
      ?.observation ?? "",
    /Targeted blocker search returned citations/,
  );
});

test("a non-empirical claim still gets three independent checks and skips routine web research", async () => {
  const requests: string[] = [];
  const report = await runReview(
    mockProvider({
      inspect: ({ instructions }) => requests.push(instructions),
    }),
    {
      ...input,
      claims: [
        { id: "scope", risk: "logic", text: "The rollout can be paused." },
      ],
    },
    () => {},
    signal,
    { sourceReader },
  );
  assert.equal(
    requests.filter((prompt) =>
      prompt.includes("Return one finding per assigned ID"),
    ).length,
    3,
  );
  assert.deepEqual(report.sources, []);
  assert.equal(
    report.findings[0].audit?.find(({ stage }) => stage === "Evidence")?.status,
    "skipped",
  );
});

test("a blocker without applicable public evidence cannot establish a verdict", async () => {
  for (const probe of ["unrelated", "private"] as const) {
    let followUps = 0;
    const report = await runReview(
      mockProvider({
        probe,
        inspect: ({ instructions }) => {
          if (instructions.includes("Cross-examine")) followUps++;
        },
      }),
      input,
      () => {},
      signal,
      { sourceReader },
    );
    assert.equal(followUps, probe === "private" ? 0 : 1);
    assert.equal(report.findings[0].verdict, "Unresolved");
    assert.deepEqual(report.findings[0].sourceIds, []);
  }
});

test("the decision recommendation prioritizes an unresolved critical claim over a secondary miss", async () => {
  const report = await runReview(
    mockProvider({ wrongCitation: true }),
    {
      ...input,
      claims: [
        input.claims[0],
        { ...input.claims[1], text: "60 * 2 = 150 exports per minute." },
      ],
    },
    () => {},
    signal,
    { sourceReader },
  );
  assert.deepEqual(
    report.findings.map(({ verdict }) => verdict),
    ["Unresolved", "Contradicted"],
  );
  assert.match(report.recommendation, /Resolve the evidence gaps/);
});

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
    const audit = report.findings[0].audit?.find(
      ({ stage }) => stage === "Verification",
    )?.observation;
    assert.match(
      audit ?? "",
      condition === "shortPremise" ? /below the minimum/ : /Verifier rejected/,
    );
  }
});

test("verification can recover a missing quote without inventing a premise", async () => {
  const review = (options: Parameters<typeof mockProvider>[0]) =>
    runReview(
      mockProvider({ internal: true, searchDown: true, ...options }),
      input,
      () => {},
      signal,
    );
  const usable = await review({ recoverQuote: true, malformed: true });
  assert.equal(usable.findings[0].verdict, "Contradicted");
  assert.equal(usable.findings[0].basis, "proposal");
  assert.ok(input.proposal.includes(usable.findings[0].proposalExcerpt!));
  const insufficient = await review({
    recoverQuote: true,
    nonEntailingPremise: true,
  });
  assert.equal(insufficient.findings[0].verdict, "Unresolved");
  const limitation = await review({ qualifies: true });
  assert.equal(limitation.findings[0].verdict, "Weakened");
});

test("a rejected synthesis verdict cannot authorize rollout in the recommendation", async () => {
  const report = await runReview(
    mockProvider({ wrongCitation: true, misleadingRecommendation: true }),
    input,
    () => {},
    signal,
    { sourceReader },
  );
  assert.equal(report.findings[0].verdict, "Unresolved");
  assert.match(report.recommendation, /Resolve the evidence gaps/);
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
  assert.equal(
    (await run({ zeroCitations: true })).findings[0].verdict,
    "Unresolved",
  );
  assert.equal(
    (await run({ needsInformation: true })).findings[0].verdict,
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

test("an unstated integer rounding rule weakens a claim without calling it contradicted", async () => {
  const report = await runReview(
    mockProvider({ malformed: true }),
    {
      ...input,
      claims: [
        {
          id: "capacity",
          risk: "logic",
          text: "Budget 1000 / 7 = 142 requests per worker.",
        },
      ],
    },
    () => {},
    signal,
  );
  assert.equal(report.findings[0].verdict, "Weakened");
  assert.equal(report.findings[0].basis, "arithmetic");
  assert.match(report.findings[0].rationale, /142\.857.*floor/);
  assert.match(report.recommendation, /State the rounding rule/);
});

test("only an exact claim-scoped project quote can support a verdict", async () => {
  const projectEvidence = [
    { id: "benchmark", title: "Checkout load run", text: benchmarkQuote },
  ];
  for (const scenario of ["valid", "fabricated", "another-claim"] as const) {
    const events: ReviewEvent[] = [];
    const report = await runReview(
      mockProvider({ submittedEvidence: scenario, searchDown: true }),
      { ...input, projectEvidence },
      (event) => events.push(event),
      signal,
    );
    const finding = report.findings[0];
    if (scenario === "valid") {
      assert.equal(finding.verdict, "Supported");
      assert.equal(finding.basis, "project");
      assert.equal(finding.projectCitations?.[0].quote, benchmarkQuote);
      assert.deepEqual(finding.sourceIds, []);
      assert.ok(
        events.some(
          (event) =>
            event.type === "progress" &&
            event.claimId === finding.claim.id &&
            event.detail === benchmarkQuote,
        ),
      );
    } else {
      assert.equal(finding.verdict, "Unresolved");
      assert.ok(!finding.projectCitations?.length);
    }
  }
});

test("the deterministic retry budget can contradict a claim without synthesis", async () => {
  const report = await runReview(
    mockProvider({ malformed: true }),
    {
      ...input,
      claims: [
        {
          id: "retry-budget",
          text: "Maximum downstream attempts stay below 20.",
          engineeringCheck: { kind: "retries", values: [3, 3, 20] },
        },
      ],
    },
    () => {},
    signal,
  );
  assert.equal(report.findings[0].basis, "engineering");
  assert.equal(report.findings[0].verdict, "Contradicted");
  assert.match(report.findings[0].rationale, /27 downstream attempts/);
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

test("health reports a valid deployment revision without caching it", async () => {
  const revision = "0123456789abcdef".repeat(2) + "01234567";
  await withServer(createApp(undefined, { revision }), async (url) => {
    const health = await fetch(url + "/health");
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("cache-control"), "no-store");
    assert.deepEqual(await health.json(), { ok: true, revision });
  });
  await withServer(
    createApp(undefined, { revision: "invalid" }),
    async (url) => {
      const health = await fetch(url + "/health");
      assert.deepEqual(await health.json(), { ok: true });
    },
  );
});

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

test("a provider rate limit returns a retryable message without its response body", async () => {
  const provider = createProvider(
    "fixture",
    "fixture",
    async () => new Response("Private upstream details", { status: 429 }),
  );
  await withServer(createApp(provider), async (url) => {
    const response = await post(url + "/api/claims", {
      proposal: input.proposal,
    });
    assert.equal(response.status, 429);
    const body = await response.text();
    assert.match(body, /usage or billing limit/);
    assert.doesNotMatch(body, /Private upstream details/);
  });
});

test("a busy review is rejected before it can consume account quota", async () => {
  let enter!: () => void;
  let release!: (allowed: boolean) => void;
  const entered = new Promise<void>((resolve) => (enter = resolve));
  const reserved = new Promise<boolean>((resolve) => (release = resolve));
  let reservations = 0;
  const app = createApp(mockProvider(), {
    verifySession: async () => "test-account",
    reserveUsage: async () => {
      if (++reservations === 2) enter();
      return reserved;
    },
  });
  await withServer(app, async (url) => {
    function extract() {
      return fetch(url + "/api/claims", {
        method: "POST",
        headers: {
          Authorization: "Bearer fixture-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proposal: input.proposal }),
        signal: AbortSignal.timeout(5000),
      });
    }
    const active = [extract(), extract()];
    try {
      await entered;
      assert.equal((await extract()).status, 429);
      assert.equal(reservations, 2);
    } finally {
      release(true);
      const responses = await Promise.all(active);
      assert.ok(responses.every((response) => response.ok));
    }
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
      const review = await post(url + "/api/reviews", input);
      assert.equal(review.status, 401);
      assert.equal(review.headers.get("cache-control"), "no-store");
      const settings = url + "/api/settings/provider";
      assert.equal((await fetch(settings)).status, 401);
      assert.equal((await post(settings, {})).status, 401);
      assert.equal((await fetch(settings, { method: "DELETE" })).status, 401);
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

function keySessionToken(id: number, revision = 1) {
  const sessionId = `10000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
  return `header.${Buffer.from(JSON.stringify({ session_id: sessionId, revision })).toString("base64url")}.signature`;
}

test("separate sign-in sessions can validate concurrently and token refresh preserves the session guard", async () => {
  let markEntered!: () => void;
  let release!: () => void;
  let failWait!: (reason: Error) => void;
  const finishedEntering = new Promise<void>((resolve, reject) => {
    markEntered = resolve;
    failWait = reject;
  });
  const validationGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = 0;
  await withServer(
    createApp(undefined, {
      verifySession: async () => "test-account",
      metaRequest: async () => {
        if (++entered === 5) markEntered();
        await validationGate;
        return Response.json({ status: "completed" });
      },
    }),
    async (url) => {
      const send = (token: string) =>
        fetch(url + "/api/settings/provider", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ key: "synthetic-test-key-value" }),
        });
      const requests = [1, 2, 3, 4, 5].map((id) => send(keySessionToken(id)));
      const deadline = setTimeout(
        () => failWait(new Error("Expected five active validations.")),
        2000,
      );
      try {
        await finishedEntering;
        const duplicate = await send(keySessionToken(1, 2));
        assert.equal(duplicate.status, 429);
        assert.match(await duplicate.text(), /already in progress/);
      } finally {
        clearTimeout(deadline);
        release();
        await Promise.allSettled(requests);
      }
      assert.deepEqual(
        (await Promise.all(requests)).map(({ status }) => status),
        [201, 201, 201, 201, 201],
      );
    },
  );
});

test("personal keys require authentication, stay scoped to the sign-in session, and are never echoed", async () => {
  const token = keySessionToken(1);
  const otherSession = keySessionToken(2);
  const key = "synthetic-test-key-value";
  const extractionModels: string[] = [];
  await withServer(
    createApp(undefined, {
      metaRequest: async (url, init) => {
        assert.equal(url, "https://api.meta.ai/v1/responses");
        const submitted = new Headers(init?.headers).get("Authorization");
        const body = JSON.parse(String(init?.body));
        if (body.text) {
          extractionModels.push(body.model);
          return success(
            JSON.stringify({
              scope: "engineering",
              explanation: "",
              claims: [
                {
                  text: "The sample can run with Ember.",
                  risk: "logic",
                  loadBearing: false,
                },
              ],
            }),
          );
        }
        assert.equal(body.store, false);
        assert.deepEqual(body.reasoning, { effort: "low" });
        if (body.model === "muse-wonder-1.0")
          return new Response(null, { status: 403 });
        if (submitted === "Bearer validation-request-error") {
          return new Response(null, { status: 400 });
        }
        return submitted === `Bearer ${key}`
          ? Response.json({ status: "completed" })
          : new Response(null, { status: 401 });
      },
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
      const withoutKey = await fetch(url + "/api/claims", {
        method: "POST",
        headers,
        body: JSON.stringify({ proposal: demoProposal }),
      });
      assert.equal(withoutKey.status, 409);
      assert.match(await withoutKey.text(), /Settings/);
      const invalidKey = () =>
        fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ key: "invalid-test-key-value" }),
        });
      const rejected = await invalidKey();
      assert.equal(rejected.status, 422);
      assert.doesNotMatch(await rejected.text(), /invalid-test-key-value/);
      assert.deepEqual(await (await fetch(endpoint, { headers })).json(), {
        saved: false,
        model: "muse-spark-1.3",
      });
      const unsupportedRequest = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ key: "validation-request-error" }),
      });
      assert.equal(unsupportedRequest.status, 502);
      assert.match(
        await unsupportedRequest.text(),
        /Meta declined the validation request/,
      );
      assert.deepEqual(await (await fetch(endpoint, { headers })).json(), {
        saved: false,
        model: "muse-spark-1.3",
      });
      const saved = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ key }),
      });
      assert.equal(saved.status, 201);
      assert.doesNotMatch(await saved.text(), /synthetic-test-key-value/);
      const first = await (await fetch(endpoint, { headers })).json();
      assert.equal(first.model, "muse-spark-1.3");
      const select = (model: string) =>
        fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ model }),
        });
      assert.equal((await select("unknown-model")).status, 400);
      assert.equal((await select("muse-wonder-1.0")).status, 422);
      assert.equal(
        (await (await fetch(endpoint, { headers })).json()).model,
        "muse-spark-1.3",
      );
      const changed = await select("muse-ember-1.0");
      assert.equal(changed.status, 200);
      assert.deepEqual(await changed.json(), {
        ...first,
        model: "muse-ember-1.0",
      });
      const extracted = await fetch(url + "/api/claims", {
        method: "POST",
        headers,
        body: JSON.stringify({ proposal: demoProposal }),
      });
      assert.equal(extracted.status, 200);
      assert.equal(
        (await extracted.json()).claims[0].text,
        "The sample can run with Ember.",
      );
      const repeat = () =>
        fetch(url + "/api/claims", {
          method: "POST",
          headers,
          body: JSON.stringify({ proposal: demoProposal }),
        });
      assert.equal((await repeat()).status, 200);
      assert.deepEqual(extractionModels, ["muse-ember-1.0"]);
      assert.equal((await select("muse-spark-1.3")).status, 200);
      assert.equal((await repeat()).status, 200);
      assert.deepEqual(extractionModels, ["muse-ember-1.0", "muse-spark-1.3"]);
      assert.equal((await invalidKey()).status, 422);
      assert.equal(
        (await (await fetch(endpoint, { headers })).json()).saved,
        true,
      );
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
        { saved: false, model: "muse-spark-1.3" },
      );
      assert.equal(
        (await fetch(endpoint, { method: "DELETE", headers })).status,
        200,
      );
      assert.deepEqual(await (await fetch(endpoint, { headers })).json(), {
        saved: false,
        model: "muse-spark-1.3",
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
      assert.equal(body.max_tool_calls, 3);
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

test("a Meta blocker probe stays within one web call even when output is exhausted", async () => {
  let requests = 0;
  const provider = createProvider(
    "synthetic-test-key",
    "muse-spark-1.3",
    async (_url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.max_tool_calls, 1);
      assert.deepEqual(body.tools, [
        { type: "web_search", search_context_size: "low" },
      ]);
      return Response.json({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      });
    },
    "meta",
  );
  await assert.rejects(
    provider.research("Check a public blocker.", {}, signal, {
      maxToolCalls: 1,
    }),
  );
  assert.equal(requests, 1);
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

test("Meta groups identical instruction prefixes and reports reused input tokens", async () => {
  const requests: {
    prompt_cache_key: string;
    input: string;
    store: boolean;
  }[] = [];
  const cached: (number | null)[] = [];
  const provider = createProvider(
    "synthetic",
    "muse-spark-1.3",
    async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        status: "completed",
        usage: {
          input_tokens: 1200,
          output_tokens: 4,
          input_tokens_details: {
            cached_tokens: requests.length === 2 ? 1024 : 0,
          },
        },
        output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }],
      });
    },
    "meta",
    { onUsage: ({ cachedInputTokens }) => cached.push(cachedInputTokens) },
  );
  const schema = z.object({ ok: z.boolean() });
  await provider.structured(
    "Check this claim.",
    { proposal: "First private proposal" },
    schema,
    signal,
  );
  await provider.structured(
    "Check this claim.",
    { proposal: "Second private proposal" },
    schema,
    signal,
  );
  await provider.structured(
    "Use a different review rubric.",
    {},
    schema,
    signal,
  );
  assert.match(requests[0].prompt_cache_key, /^tactile-v1-[a-f0-9]{24}$/);
  assert.equal(requests[0].prompt_cache_key, requests[1].prompt_cache_key);
  assert.notEqual(requests[0].prompt_cache_key, requests[2].prompt_cache_key);
  assert.notEqual(requests[0].input, requests[1].input);
  assert.ok(requests.every(({ store }) => !store));
  assert.deepEqual(cached, [0, 1024, 0]);
});
