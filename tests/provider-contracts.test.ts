import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  createReviewProvider,
  discoverModels,
} from "../server/provider-catalog.ts";
import {
  ProviderOutputError,
  ProviderResponseError,
} from "../server/provider.ts";
import { providerSchema } from "../shared/providers.ts";

const models = {
  groq: "openai/gpt-oss-20b",
  meta: "muse-spark-1.3",
  gemini: "gemini-3.8-flash",
  openai: "gpt-5-mini",
  xai: "grok-4.7",
};
const hosts = {
  groq: "api.groq.com",
  meta: "api.meta.ai",
  gemini: "generativelanguage.googleapis.com",
  openai: "api.openai.com",
  xai: "api.x.ai",
};
const answer = z.object({ decision: z.string() });
const passage = "Queue ordering is defined per partition.";
const citation = {
  type: "url_citation",
  title: "Queue protocol",
  url: "https://docs.example.invalid/queue",
  start_index: 0,
  end_index: passage.length,
};

for (const id of providerSchema.options) {
  test(`${id} discovers compatible models, validates structured responses, and keeps evidence tied to source metadata`, async () => {
    const key = "fixture-only-" + id + "-key";
    const usage: unknown[] = [];
    const request: typeof fetch = async (input, options) => {
      const url = new URL(String(input));
      const headers = new Headers(options?.headers);
      if (id === "gemini" && url.hostname === "en.wikipedia.org") {
        assert.equal(headers.get("authorization"), null);
        assert.equal(headers.get("x-goog-api-key"), null);
        return Response.json({
          pages: [
            {
              key: "Partition",
              title: "Partition",
              excerpt: "<b>Queue</b> ordering.",
            },
          ],
        });
      }
      assert.equal(url.hostname, hosts[id]);
      assert.equal(options?.redirect, "error");
      assert.equal(
        headers.get(id === "gemini" ? "x-goog-api-key" : "authorization"),
        id === "gemini" ? key : "Bearer " + key,
      );
      if (url.pathname.endsWith("/models")) {
        if (id === "gemini")
          return Response.json({
            models: [
              {
                name: "models/" + models[id],
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/gemini-3.8-flash-audio",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          });
        return Response.json({
          object: "list",
          data: [{ id: models[id] }, { id: "embedding-model" }],
        });
      }
      const body = JSON.parse(String(options?.body));
      const search = Boolean(body.tools);
      const text = search ? passage : JSON.stringify({ decision: "hold" });
      if (id === "groq") {
        assert.equal(url.pathname, "/openai/v1/chat/completions");
        assert.equal(body.model, models[id]);
        assert.equal(
          search ? body.tools[0].type : body.response_format.type,
          search ? "browser_search" : "json_schema",
        );
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: text, annotations: search ? [citation] : [] },
            },
          ],
          usage: {
            prompt_tokens: 13,
            completion_tokens: 4,
            prompt_tokens_details: { cached_tokens: 2 },
          },
        });
      }
      if (id === "gemini") {
        assert.equal(
          url.pathname,
          "/v1beta/models/" + models[id] + ":generateContent",
        );
        assert.equal(
          body.generationConfig.responseMimeType,
          "application/json",
        );
        assert.ok(body.generationConfig.responseJsonSchema.properties.decision);
        return Response.json({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text }] } },
          ],
          usageMetadata: {
            promptTokenCount: 13,
            candidatesTokenCount: 4,
            cachedContentTokenCount: 2,
          },
        });
      }
      assert.equal(url.pathname, "/v1/responses");
      assert.equal(body.model, models[id]);
      assert.equal(body.store, false);
      assert.equal(
        search ? body.tools[0].type : body.text.format.type,
        search ? "web_search" : "json_schema",
      );
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text,
                annotations: search ? [citation] : [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 13,
          output_tokens: 4,
          input_tokens_details: { cached_tokens: 2 },
        },
      });
    };
    const signal = AbortSignal.timeout(5000);
    const catalog = await discoverModels(id, key, signal, request);
    assert.deepEqual(
      catalog.models.map((model) => model.id),
      [models[id]],
    );
    assert.equal(catalog.recommended, models[id]);
    const provider = createReviewProvider(id, key, models[id], request, {
      onUsage: (counts) => usage.push(counts),
    });
    assert.deepEqual(
      await provider.structured(
        "Write a verdict",
        { input: "queue" },
        answer,
        signal,
      ),
      { decision: "hold" },
    );
    assert.deepEqual(usage[0], {
      inputTokens: 13,
      outputTokens: 4,
      cachedInputTokens: 2,
    });
    const evidence = await provider.research(
      "Search for data",
      { query: "queue ordering" },
      signal,
    );
    assert.equal(evidence.citations.length, 1);
    assert.equal(
      evidence.citations[0].url,
      id === "gemini"
        ? "https://en.wikipedia.org/wiki/Partition"
        : citation.url,
    );
    assert.doesNotMatch(JSON.stringify(evidence), new RegExp(key));
  });

  test(`${id} preserves rate, authentication, model, response and cancellation errors without exposing bodies`, async () => {
    const key = "fixture-secret-not-for-errors";
    const signal = AbortSignal.timeout(5000);
    for (const status of [401, 404, 429]) {
      const mock: typeof fetch = async () =>
        new Response(
          JSON.stringify({ error: { code: "model_not_found", message: key } }),
          { status, headers: { "Retry-After": "17" } },
        );
      const provider = createReviewProvider(id, key, models[id], mock);
      await assert.rejects(
        provider.structured("check", {}, answer, signal),
        (error) =>
          error instanceof ProviderResponseError &&
          error.status === status &&
          !error.message.includes(key) &&
          (status !== 429 || error.retryAfter === "17"),
      );
    }
    const malformed = createReviewProvider(id, key, models[id], async () =>
      Response.json({ invalid: key }),
    );
    await assert.rejects(
      malformed.structured("check", {}, answer, signal),
      ProviderOutputError,
    );
    const controller = new AbortController();
    const wait: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    const provider = createReviewProvider(id, key, models[id], wait);
    const pending = provider.structured("check", {}, answer, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    const stalled: typeof fetch = async (_url, options) => {
      await delay(1000, undefined, { signal: options?.signal ?? undefined });
      return Response.json({});
    };
    const timed = createReviewProvider(id, key, models[id], stalled, {
      requestTimeoutMs: 10,
    });
    await assert.rejects(timed.structured("check", {}, answer, signal), {
      name: "TimeoutError",
    });
  });
}
