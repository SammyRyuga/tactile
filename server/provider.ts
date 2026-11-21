import { z } from "zod";
import { uniqueSourcesByUrl } from "../shared/review.ts";

const annotationSchema = z.object({
  type: z.literal("url_citation"),
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().min(1).max(500),
  start_index: z.number().int().nonnegative(),
  end_index: z.number().int().positive(),
});

const responseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({ content: z.array(z.unknown()).optional() })),
});

const textSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).default([]),
});

export interface Citation {
  url: string;
  title: string;
  passage: string;
  anchor?: string;
  startIndex: number;
  endIndex: number;
}

export interface ReviewProvider {
  structured<T>(
    instruction: string,
    data: unknown,
    schema: z.ZodType<T>,
    signal: AbortSignal,
    verification?: { model?: string },
  ): Promise<T>;
  research(
    instruction: string,
    data: unknown,
    signal: AbortSignal,
    options?: { maxToolCalls?: number },
  ): Promise<{ text: string; citations: Citation[] }>;
}

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

const usageSchema = z.object({
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

export const metaStructuredEffort = "low";

export class ProviderResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Provider request failed with status ${status}.`);
    this.name = "ProviderResponseError";
    this.status = status;
  }
}

export function createProvider(
  key: string,
  model: string,
  request = fetch,
  vendor: "openai" | "meta" = "openai",
  config: {
    verifierModel?: string;
    requestTimeoutMs?: number;
    onRequest?: () => void;
    onUsage?: (usage: ProviderUsage) => void;
  } = {},
): ReviewProvider {
  async function respond(
    instructions: string,
    data: unknown,
    signal: AbortSignal,
    options: object,
  ) {
    const requestModel =
      "model" in options && typeof options.model === "string"
        ? options.model
        : model;
    const callSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(config.requestTimeoutMs ?? 35_000),
    ]);
    async function send(maxOutputTokens: number): Promise<unknown> {
      const endpoint =
        vendor === "meta"
          ? "https://api.meta.ai/v1/responses"
          : "https://api.openai.com/v1/responses";
      config.onRequest?.();
      const response = await request(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: callSignal,
        body: JSON.stringify({
          model: requestModel,
          instructions,
          input: JSON.stringify(data),
          store: false,
          max_output_tokens: maxOutputTokens,
          ...(vendor === "meta"
            ? {
                reasoning: {
                  effort: "tools" in options ? "medium" : metaStructuredEffort,
                },
              }
            : requestModel.startsWith("gpt-5")
              ? { reasoning: { effort: "low" } }
              : {}),
          ...options,
        }),
      });
      const payload: unknown = response.ok ? await response.json() : undefined;
      const usage = usageSchema.safeParse(payload);
      config.onUsage?.({
        inputTokens: usage.success ? usage.data.usage.input_tokens : null,
        outputTokens: usage.success ? usage.data.usage.output_tokens : null,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderResponseError(response.status);
      }
      return payload;
    }
    const first = await send(5500);
    const exhausted = z
      .object({
        status: z.literal("incomplete"),
        incomplete_details: z.object({
          reason: z.literal("max_output_tokens"),
        }),
      })
      .safeParse(first).success;
    const payload = exhausted ? await send(8500) : first;
    const { output } = responseSchema.parse(payload);
    const outputText = output
      .flatMap(({ content }) => content ?? [])
      .flatMap((item) => {
        const parsed = textSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
    if (!outputText.length)
      throw new Error("Provider returned no completed text.");
    return outputText;
  }

  return {
    async structured<T>(
      instruction: string,
      data: unknown,
      schema: z.ZodType<T>,
      signal: AbortSignal,
      verification?: { model?: string },
    ) {
      const jsonSchema = z.toJSONSchema(schema);
      delete jsonSchema.$schema;
      const verifier =
        verification &&
        (vendor === "openai"
          ? (verification.model ?? config.verifierModel)
          : config.verifierModel);
      const result = await respond(instruction, data, signal, {
        ...(verifier ? { model: verifier } : {}),
        text: {
          format: {
            type: "json_schema",
            name: "tactile_result",
            strict: true,
            schema: jsonSchema,
          },
        },
      });
      return schema.parse(JSON.parse(result.map(({ text }) => text).join("")));
    },

    async research(instruction, data, signal, options) {
      const result = await respond(instruction, data, signal, {
        ...(vendor === "meta"
          ? {
              tools: [
                {
                  type: "web_search",
                  search_context_size:
                    options?.maxToolCalls === 3 ? "high" : "medium",
                },
              ],
            }
          : {
              tools: [{ type: "web_search" }],
              tool_choice: { type: "web_search" },
              max_tool_calls: options?.maxToolCalls ?? 2,
            }),
      });
      const citations: Citation[] = [];
      for (const item of result) {
        const characters = Array.from(item.text);
        for (const annotation of item.annotations) {
          const parsed = annotationSchema.safeParse(annotation);
          if (!parsed.success) continue;
          const { url, title, start_index, end_index } = parsed.data;
          if (end_index <= start_index || end_index > characters.length)
            continue;
          // The annotation can point to a citation marker. Preserve its offsets
          // and include the adjacent wording from the same response paragraph.
          const before = characters
            .slice(Math.max(0, start_index - 480), start_index)
            .join("")
            .split("\n")
            .at(-1);
          const after = characters
            .slice(start_index, Math.min(characters.length, end_index + 200))
            .join("")
            .split("\n")[0];
          const passage = ((before ?? "") + after).trim().slice(0, 700);
          if (passage)
            citations.push({
              url,
              title,
              passage,
              anchor: characters.slice(start_index, end_index).join("").trim(),
              startIndex: start_index,
              endIndex: end_index,
            });
        }
      }
      return {
        text: result.map(({ text }) => text).join("\n"),
        citations: uniqueSourcesByUrl(citations).slice(0, 8),
      };
    },
  };
}
