import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../server/app.ts";
import { createProvider, ProviderResponseError } from "../server/provider.ts";
import {
  MetaModelLookupError,
  personalKeySchema,
  validateMetaKey,
} from "../server/provider-settings.ts";
import { defaultReviewModel } from "../shared/models.ts";
import {
  attachmentTextSchema,
  claimListSchema,
  claimSchema,
  decisionContextSchema,
  limits,
  projectEvidenceSchema,
  proposalIntakeSchema,
  proposalRevisionSchema,
  proposalSchema,
  reviewInputSchema,
} from "../shared/review.ts";

const plan = "Verify queue ordering under load using test records.";
const claim = { id: "fixture-a", text: "The queue preserves order." };

test("proposal, claim, evidence, attachment, decision and key length boundaries", () => {
  const boundaries = [
    [proposalSchema, 20, limits.proposal, (text: string) => text],
    [claimSchema, 1, limits.claim, (text: string) => ({ ...claim, text })],
    [
      projectEvidenceSchema,
      12,
      limits.evidenceText,
      (text: string) => ({ id: "ev", title: "Source", text }),
    ],
    [
      projectEvidenceSchema,
      1,
      100,
      (title: string) => ({ id: "ev", title, text: plan }),
    ],
    [
      attachmentTextSchema,
      12,
      limits.evidenceText,
      (text: string) => ({ text, truncated: false }),
    ],
    [
      decisionContextSchema,
      0,
      120,
      (deadline: string) => ({ deadline, reversibility: null }),
    ],
    [personalKeySchema, 12, 512, (key: string) => ({ key })],
  ] as const;
  for (const [schema, min, max, input] of boundaries) {
    for (const length of new Set([
      0,
      1,
      Math.max(0, min - 1),
      min,
      min + 1,
      max - 1,
      max,
      max + 1,
      max * 2,
    ])) {
      assert.equal(
        schema.safeParse(input("x".repeat(length))).success,
        length >= min && length <= max,
        `min=${min} max=${max} length=${length}`,
      );
    }
  }
  assert.equal(claimListSchema.safeParse([]).success, false);
  for (let size = 1; size <= limits.claims + 1; size++) {
    const claims = Array.from({ length: size }, (_, id) => ({
      ...claim,
      id: String(id),
    }));
    assert.equal(
      reviewInputSchema.safeParse({ proposal: plan, claims }).success,
      size <= limits.claims,
    );
  }
  assert.equal(
    reviewInputSchema.safeParse({ proposal: plan, claims: [claim, claim] })
      .success,
    false,
  );
  assert.equal(
    proposalRevisionSchema.safeParse({ proposal: plan, changes: [] }).success,
    false,
  );
  assert.equal(
    proposalIntakeSchema.safeParse({
      proposal: plan,
      clarification: { round: 4, previousQuestion: "More details?" },
    }).success,
    false,
  );
});

test("seeded Unicode and multiline intake stays within the documented length budget", () => {
  const seed = 0x53af19e7;
  let current = seed;
  const samples = [
    "🧪",
    "測試",
    "العربية",
    "עברית",
    "e\u0301",
    "\u00e9",
    "\t",
    "\r\n",
    "\u200b",
    "¶",
    "# ",
    "<sample>",
    "\\",
    '"',
  ];
  for (let count = 0; count < 240; count++) {
    current = (Math.imul(current, 1664525) + 1013904223) >>> 0;
    const text = ("plan " + samples[(current >>> 5) % samples.length]).repeat(
      1 + ((current >>> 15) % 750),
    );
    const parsed = proposalSchema.safeParse(text);
    const trimmed = text.trim();
    assert.equal(
      parsed.success,
      trimmed.length >= 20 && trimmed.length <= limits.proposal,
      `seed=${seed} case=${count}`,
    );
    if (parsed.success) assert.equal(parsed.data, trimmed);
  }
  for (const proposal of [
    null,
    [],
    {},
    21,
    undefined,
    " \r\t",
    "a\n".repeat(1700),
  ]) {
    assert.equal(proposalIntakeSchema.safeParse({ proposal }).success, false);
  }
  assert.deepEqual(
    proposalIntakeSchema.parse({ proposal: plan, extra: { unrelated: true } }),
    { proposal: plan },
  );
});

test("bad requests are rejected before quota or provider use", async () => {
  let quotaCalls = 0;
  let providerCalls = 0;
  const provider = createProvider("fixture-only", "test", async () => {
    providerCalls++;
    throw new Error("Malformed input should never reach the provider.");
  });
  const server = createServer(
    createApp(provider, {
      verifySession: async (token) =>
        token === "fixture-token" ? "fixture-account" : null,
      reserveUsage: async () => {
        quotaCalls++;
        return true;
      },
    }),
  ).listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  try {
    for (const [path, body, status] of [
      ["claims", "{", 400],
      ["claims", JSON.stringify({ proposal: null }), 400],
      [
        "claims",
        JSON.stringify({ proposal: "x".repeat(limits.proposal + 1) }),
        400,
      ],
      ["claims", JSON.stringify({ proposal: "x".repeat(83000) }), 413],
      ["revisions", JSON.stringify({ proposal: plan, changes: [] }), 400],
      [
        "reviews",
        JSON.stringify({ proposal: plan, claims: [claim, claim] }),
        400,
      ],
      [
        "reviews",
        JSON.stringify({ proposal: plan, claims: [claim], reviewers: [] }),
        400,
      ],
    ] as const) {
      const response = await fetch(origin + "/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fixture-token",
        },
        body,
      });
      assert.equal(response.status, status, path);
      const payload = await response.json();
      assert.equal(typeof payload.message, "string");
      assert.doesNotMatch(
        payload.message,
        /fixture-token|at \w+\s*\(|node_modules/,
      );
    }
    assert.equal(quotaCalls, 0);
    assert.equal(providerCalls, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Meta metadata failures stay bounded and never fall through to generation", async () => {
  const signal = AbortSignal.timeout(2000);
  const model = defaultReviewModel;
  for (const status of [400, 401, 403, 408, 429, 500, 502, 503, 504]) {
    const requests: string[] = [];
    await assert.rejects(
      validateMetaKey("fixture-only", model, signal, async (url, options) => {
        requests.push(`${options?.method} ${String(url)}`);
        return new Response("Synthetic response", { status });
      }),
      (error) =>
        error instanceof ProviderResponseError && error.status === status,
    );
    assert.deepEqual(requests, ["GET https://api.meta.ai/v1/models"]);
  }
  for (const catalog of [
    "",
    "{",
    "<html></html>",
    '{"object":"list","data":[]}',
  ]) {
    const requests: string[] = [];
    await assert.rejects(
      validateMetaKey("fixture-only", model, signal, async (url, options) => {
        requests.push(`${options?.method} ${String(url)}`);
        return requests.length === 1
          ? new Response(catalog)
          : new Response('{"error":{"code":"model_not_found"}}', {
              status: 404,
            });
      }),
      (error) =>
        error instanceof MetaModelLookupError && error.confirmedMissing,
    );
    assert.equal(requests.length, 2);
    assert.ok(
      requests.every((request) =>
        request.startsWith("GET https://api.meta.ai/v1/models"),
      ),
    );
  }
  for (const networkError of ["ENOTFOUND", "ECONNRESET", "CERT_HAS_EXPIRED"]) {
    await assert.rejects(
      validateMetaKey("fixture-only", model, signal, async () => {
        throw new TypeError("Fixture transport error", {
          cause: { code: networkError },
        });
      }),
      (error) => error instanceof ProviderResponseError && error.status === 0,
    );
  }
});
