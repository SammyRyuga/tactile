import { z } from "zod";

const annotationSchema = z.object({
  type: z.literal("url_citation"),
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().min(1).max(500),
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

export type Citation = Omit<z.infer<typeof annotationSchema>, "type">;

export interface ReviewProvider {
  structured<T>(
    instruction: string,
    data: unknown,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ): Promise<T>;
  research(
    instruction: string,
    data: unknown,
    signal: AbortSignal,
  ): Promise<{ text: string; citations: Citation[] }>;
}

export function createProvider(
  key: string,
  model: string,
  request = fetch,
): ReviewProvider {
  async function respond(
    instructions: string,
    data: unknown,
    signal: AbortSignal,
    options: object,
  ) {
    const response = await request("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(35_000)]),
      body: JSON.stringify({
        model,
        instructions,
        input: JSON.stringify(data),
        store: false,
        max_output_tokens: 5500,
        ...options,
      }),
    });
    if (!response.ok)
      throw new Error(
        `Provider request failed with status ${response.status}.`,
      );
    const { output } = responseSchema.parse(await response.json());
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
    ) {
      const jsonSchema = z.toJSONSchema(schema);
      delete jsonSchema.$schema;
      const result = await respond(instruction, data, signal, {
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

    async research(instruction, data, signal) {
      const result = await respond(instruction, data, signal, {
        tools: [{ type: "web_search" }],
        tool_choice: { type: "web_search" },
        max_tool_calls: 2,
      });
      const sources = new Map<string, Citation>();
      for (const item of result.flatMap(({ annotations }) => annotations)) {
        const parsed = annotationSchema.safeParse(item);
        if (parsed.success)
          sources.set(parsed.data.url, {
            url: parsed.data.url,
            title: parsed.data.title,
          });
      }
      return {
        text: result
          .map(({ text }) => text)
          .join("\n")
          .slice(0, 4800),
        citations: [...sources.values()].slice(0, 5),
      };
    },
  };
}
