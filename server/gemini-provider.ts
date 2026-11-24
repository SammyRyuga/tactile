import { z } from "zod";
import { convert } from "html-to-text";
import {
  ProviderOutputError,
  providerJson,
  providerStage,
  structuredResult,
} from "./provider.ts";
import type { ProviderConfig, ReviewProvider } from "./provider.ts";

export const geminiBase = "https://generativelanguage.googleapis.com/v1beta";
export const geminiKeyHeader = "x-goog-api-key";

const results = z.object({
  pages: z.array(
    z.object({
      key: z.string().min(1).max(240),
      title: z.string().max(500),
      excerpt: z.string().max(10_000),
    }),
  ),
});

const resultSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      thoughtsTokenCount: z.number().int().nonnegative().optional(),
      cachedContentTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export function createGeminiProvider(
  key: string,
  model: string,
  request: typeof fetch,
  config: ProviderConfig,
): ReviewProvider {
  async function generate(
    instruction: string,
    messages: { role: "user" | "assistant"; content: string }[],
    signal: AbortSignal,
    schema?: unknown,
  ) {
    const stage = providerStage(schema);
    const outputTokens = 8192;
    const payload = await providerJson(
      request,
      geminiBase + "/models/" + encodeURIComponent(model) + ":generateContent",
      key,
      signal,
      {
        systemInstruction: { parts: [{ text: instruction }] },
        contents: messages.map(({ role, content }) => ({
          role: role === "assistant" ? "model" : "user",
          parts: [{ text: content }],
        })),
        generationConfig: {
          maxOutputTokens: outputTokens,
          ...(schema
            ? {
                responseMimeType: "application/json",
                responseJsonSchema: schema,
              }
            : {}),
        },
      },
      config,
      geminiKeyHeader,
      { vendor: "gemini", stage, outputTokens },
    );
    const result = resultSchema.safeParse(payload);
    const usage = result.success ? result.data.usageMetadata : undefined;
    config.onUsage?.(
      {
        inputTokens: usage?.promptTokenCount ?? null,
        outputTokens:
          usage?.candidatesTokenCount === undefined
            ? null
            : usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0),
        cachedInputTokens: usage?.cachedContentTokenCount ?? null,
      },
      stage,
    );
    const candidate = result.success ? result.data.candidates?.[0] : undefined;
    if (candidate?.finishReason === "MAX_TOKENS")
      throw new ProviderOutputError("incomplete");
    const text = candidate?.content?.parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    if (candidate?.finishReason !== "STOP" || !text?.trim())
      throw new ProviderOutputError("malformed");
    return text;
  }

  return {
    modelId: model,
    async structured(instruction, data, schema, signal) {
      const jsonSchema = z.toJSONSchema(schema);
      delete jsonSchema.$schema;
      return structuredResult(
        await generate(
          instruction,
          [{ role: "user", content: JSON.stringify(data) }],
          signal,
          jsonSchema,
        ),
        schema,
      );
    },
    async crossfireGenerate(instruction, messages, schema, signal) {
      return generate(instruction, messages, signal, schema);
    },
    async research(_instruction, data, signal) {
      // Google Search grounding is meant for displaying Google’s response with
      // its suggestions. Crossfire independently fetches and verifies sources.
      const input = z
        .object({ query: z.string().trim().min(1).max(500) })
        .safeParse(data);
      if (!input.success) return { text: "", citations: [] };
      const url = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
      url.searchParams.set("q", input.data.query);
      url.searchParams.set("limit", "5");
      const response = await request(url, {
        headers: {
          "User-Agent": "Tactile/0.1 (https://github.com/SammyRyuga/tactile)",
        },
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      }).catch(() => undefined);
      signal.throwIfAborted();
      if (!response?.ok) {
        await response?.body?.cancel();
        return { text: "", citations: [] };
      }
      const parsed = results.safeParse(await response.json().catch(() => null));
      signal.throwIfAborted();
      const citations = parsed.success
        ? parsed.data.pages.slice(0, 5).flatMap((page) => {
            const passage = convert(page.excerpt, { wordwrap: false })
              .trim()
              .slice(0, 700);
            return passage
              ? [
                  {
                    url:
                      "https://en.wikipedia.org/wiki/" +
                      encodeURIComponent(page.key),
                    title: page.title,
                    passage,
                    startIndex: 0,
                    endIndex: passage.length,
                  },
                ]
              : [];
          })
        : [];
      return {
        text: citations.map(({ passage }) => passage).join("\n"),
        citations,
      };
    },
  };
}
