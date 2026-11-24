import { z } from "zod";
import {
  citationsFromAnnotations,
  ProviderOutputError,
  providerJson,
  providerStage,
  structuredResult,
} from "./provider.ts";
import type { ProviderConfig, ReviewProvider } from "./provider.ts";
import { uniqueSourcesByUrl } from "../shared/review.ts";

export const groqBase = "https://api.groq.com/openai/v1";
// The catalog does not describe tools. These documented families support both
// schema output and browser search. Only models returned by discovery are offered.
export function isGroqReviewModel(id: string) {
  return /^openai\/gpt-oss-(20b|120b)(?:-[0-9][a-z0-9-]*)?$/.test(id);
}

const counts = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  prompt_tokens_details: z
    .object({ cached_tokens: z.number().int().nonnegative().optional() })
    .nullish(),
});
const completion = z.object({
  usage: counts.nullish(),
  choices: z.array(
    z.object({
      finish_reason: z.string(),
      message: z.object({
        content: z.string().nullable(),
        annotations: z.array(z.unknown()).optional(),
        executed_tools: z.array(z.unknown()).optional(),
      }),
    }),
  ),
});

const toolSearchResults = z.object({
  search_results: z.object({
    results: z.array(
      z.object({
        url: z.url({ protocol: /^https?$/ }),
        title: z.string().optional(),
        content: z.string().optional(),
        snippet: z.string().optional(),
      }),
    ),
  }),
});

export function createGroqProvider(
  key: string,
  model: string,
  request: typeof fetch,
  config: ProviderConfig,
): ReviewProvider {
  async function complete(
    instruction: string,
    messages: { role: "user" | "assistant"; content: string }[],
    signal: AbortSignal,
    schema?: unknown,
    search = false,
  ) {
    const stage = search ? "evidence_search" : providerStage(schema);
    const outputTokens =
      stage === "decision_memo" || stage === "revision"
        ? 3072
        : stage === "claim_extraction" || stage === "structured_output"
          ? 2048
          : stage === "assumption_ranking" || search
            ? 1024
            : 1536;
    const payload = await providerJson(
      request,
      groqBase + "/chat/completions",
      key,
      signal,
      {
        model,
        messages: [{ role: "system", content: instruction }, ...messages],
        reasoning_effort: "low",
        max_completion_tokens: outputTokens,
        ...(search
          ? { tools: [{ type: "browser_search" }], tool_choice: "required" }
          : {}),
        ...(schema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: { name: "tactile_result", strict: false, schema },
              },
            }
          : {}),
      },
      config,
      "Authorization",
      { vendor: "groq", stage, outputTokens },
    );
    const parsed = completion.safeParse(payload);
    const usage = parsed.success ? parsed.data.usage : undefined;
    config.onUsage?.(
      {
        inputTokens: usage?.prompt_tokens ?? null,
        outputTokens: usage?.completion_tokens ?? null,
        cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
      },
      stage,
    );
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    if (choice?.finish_reason === "length")
      throw new ProviderOutputError("incomplete");
    if (choice?.finish_reason !== "stop" || !choice.message.content?.trim())
      throw new ProviderOutputError("malformed");
    return { ...choice.message, text: choice.message.content };
  }

  return {
    modelId: model,
    async structured(instruction, data, schema, signal) {
      const jsonSchema = z.toJSONSchema(schema);
      delete jsonSchema.$schema;
      const { text } = await complete(
        instruction,
        [{ role: "user", content: JSON.stringify(data) }],
        signal,
        jsonSchema,
      );
      return structuredResult(text, schema);
    },
    async crossfireGenerate(instruction, messages, schema, signal) {
      return (await complete(instruction, messages, signal, schema)).text;
    },
    async research(instruction, data, signal) {
      const message = await complete(
        instruction,
        [{ role: "user", content: JSON.stringify(data) }],
        signal,
        undefined,
        true,
      );
      const annotations = (message.annotations ?? []).map((item) => {
        const nested = z
          .object({
            type: z.literal("url_citation"),
            url_citation: z.record(z.string(), z.unknown()),
          })
          .safeParse(item);
        return nested.success
          ? { ...nested.data.url_citation, type: "url_citation" }
          : item;
      });
      const citations = citationsFromAnnotations(message.text, annotations);
      for (const item of message.executed_tools ?? []) {
        const tool = toolSearchResults.safeParse(item);
        if (!tool.success) continue;
        for (const result of tool.data.search_results.results.slice(0, 8)) {
          const passage = (result.snippet ?? result.content)
            ?.trim()
            .slice(0, 700);
          if (passage)
            citations.push({
              url: result.url,
              title:
                result.title?.slice(0, 500) || new URL(result.url).hostname,
              passage,
              startIndex: 0,
              endIndex: passage.length,
            });
        }
      }
      return {
        text: message.text,
        citations: uniqueSourcesByUrl(citations).slice(0, 8),
      };
    },
  };
}
