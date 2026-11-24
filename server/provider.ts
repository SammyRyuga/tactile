import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProviderId } from "../shared/providers.ts";
import { uniqueSourcesByUrl } from "../shared/review.ts";

import {
  createRateSchedule,
  failureDetails,
  maximumWaitMs,
  readErrorBody,
  readRate,
  retryDelay,
  waitForProvider,
} from "./provider-rate.ts";
import type { ProviderFailureDetails, RateSchedule } from "./provider-rate.ts";

const annotationSchema = z.object({
  type: z.literal("url_citation"),
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().max(500).nullish(),
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
  providerId?: ProviderId;
  modelId?: string;
  verifierInfo?(modelOverride?: string): { model: string; distinct: boolean };
  structured<T>(
    instruction: string,
    data: unknown,
    schema: z.ZodType<T>,
    signal: AbortSignal,
    verification?: { model?: string },
  ): Promise<T>;
  crossfireGenerate?(
    instructions: string,
    messages: { role: "user" | "assistant"; content: string }[],
    schema: unknown,
    signal: AbortSignal,
  ): Promise<string>;
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
  cachedInputTokens: number | null;
};

const usageSchema = z.object({
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    input_tokens_details: z
      .object({ cached_tokens: z.number().int().nonnegative().nullish() })
      .nullish(),
  }),
});

export type ProviderConfig = {
  verifierModel?: string;
  requestTimeoutMs?: number;
  onRequest?: () => void;
  onUsage?: (usage: ProviderUsage, stage?: string) => void;
  onResponse?: (
    event: ProviderFailureDetails & {
      stage: string;
      status: number;
      attempt: number;
      estimatedInputTokens?: number;
      requestedOutputTokens?: number;
      retryAfter?: string;
    },
  ) => void;
  schedule?: RateSchedule;
  retryBudget?: { remaining: number };
};

export function structuredResult<T>(text: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new ProviderOutputError("malformed");
  }
}

export async function providerJson(
  request: typeof fetch,
  url: string,
  key: string,
  signal: AbortSignal,
  body?: Record<string, unknown>,
  config: ProviderConfig = {},
  keyHeader = "Authorization",
  call?: { vendor: ProviderId; stage: string; outputTokens: number },
): Promise<unknown> {
  const deadline = AbortSignal.any([
    signal,
    AbortSignal.timeout(config.requestTimeoutMs ?? 30_000),
  ]);
  const schedule = config.schedule ?? createRateSchedule();
  const serialized = body ? JSON.stringify(body) : undefined;
  return schedule.run(call?.vendor === "groq", deadline, async () => {
    for (let attempt = 1; ; attempt++) {
      if (call) {
        const waitUntil = Date.now() + maximumWaitMs;
        for (
          let wait = schedule.remainingWait();
          wait > 0;
          wait = schedule.remainingWait()
        ) {
          if (wait > waitUntil - Date.now())
            throw new ProviderResponseError(
              429,
              String(Math.ceil(wait / 1000)),
              {
                limitKind: schedule.limitKind(),
              },
            );
          await waitForProvider(wait, deadline);
        }
      }
      deadline.throwIfAborted();
      config.onRequest?.();
      const response = await providerFetch(request, url, {
        method: body ? "POST" : "GET",
        headers: {
          [keyHeader]: keyHeader === "Authorization" ? "Bearer " + key : key,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        redirect: "error",
        signal: deadline,
        body: serialized,
      });
      const rate = readRate(response.headers);
      const rawError = response.ok
        ? undefined
        : await readErrorBody(response, deadline);
      const details = failureDetails(response.status, rawError, rate);
      const retryAfter = providerRetryAfter(response);
      if (call)
        config.onResponse?.({
          ...details,
          stage: call.stage,
          status: response.status,
          attempt,
          retryAfter,
          requestedOutputTokens: call.outputTokens,
          estimatedInputTokens: serialized
            ? Math.ceil(Buffer.byteLength(serialized, "utf8") / 3)
            : undefined,
        });
      const tokenReset = rate?.tokens?.resetMs;
      const requestReset = rate?.requests?.resetMs;
      if (response.ok) {
        if (call && rate?.tokens?.remaining === 0 && tokenReset !== undefined)
          schedule.defer(tokenReset, "tokens");
        if (
          call &&
          rate?.requests?.remaining === 0 &&
          requestReset !== undefined
        )
          schedule.defer(
            requestReset,
            call.vendor === "groq" ? "daily" : "requests",
          );
        const payload = await response.json().catch(() => null);
        deadline.throwIfAborted();
        return payload;
      }
      deadline.throwIfAborted();
      if (
        call?.vendor === "meta" &&
        response.status === 404 &&
        details.upstreamCode !== "model_not_found"
      )
        throw new MetaResponsesNotFound();
      const delay =
        retryDelay(retryAfter) ??
        details.retryHintMs ??
        (details.limitKind === "tokens"
          ? tokenReset
          : details.limitKind === "requests"
            ? requestReset
            : undefined);
      const rateLimited =
        response.status === 429 &&
        details.limitKind !== "billing" &&
        details.limitKind !== "daily" &&
        details.limitKind !== "request_size";
      if (call && rateLimited && delay !== undefined) {
        schedule.defer(Math.max(250, delay), details.limitKind);
        if (
          delay <= maximumWaitMs &&
          attempt === 1 &&
          (config.retryBudget?.remaining ?? 1) > 0
        ) {
          if (config.retryBudget) config.retryBudget.remaining--;
          continue;
        }
      }
      throw new ProviderResponseError(
        response.status,
        retryAfter ??
          (rateLimited && delay !== undefined
            ? String(Math.ceil(delay / 1000))
            : undefined),
        details,
      );
    }
  });
}

const phaseNames: Readonly<Record<string, string>> = Object.freeze({
  ExtractedClaims: "claim_extraction",
  LoadBearingRanking: "assumption_ranking",
  ReasoningOutput: "reviewer_reasoning",
  BuilderVerdict: "builder",
  OperatorVerdict: "operator",
  ResearcherAssessment: "researcher",
  ProbeVerdict: "cross_examination",
  SteelManVerdict: "steelman",
  StrategicConsequenceOutput: "recommendation",
  CaseVerdictOutput: "decision_memo",
  ReformulatedPromptOutput: "revision",
  RecoveryResult: "clarification",
});

export function providerStage(schema: unknown): string {
  const parsed = z.object({ title: z.string() }).safeParse(schema);
  const title = parsed.success ? parsed.data.title : "";
  return Object.hasOwn(phaseNames, title)
    ? phaseNames[title]
    : "structured_output";
}

export const metaStructuredEffort = "low";

export function providerRetryAfter(response: Response): string | undefined {
  const value = response.headers.get("Retry-After");
  if (
    value &&
    (/^\d{1,15}$/.test(value) ||
      (value.length === 29 && new Date(value).toUTCString() === value))
  )
    return value;
  return undefined;
}

export class ProviderResponseError extends Error {
  readonly status: number;
  readonly retryAfter?: string;
  readonly details?: ProviderFailureDetails;

  constructor(
    status: number,
    retryAfter?: string,
    details?: ProviderFailureDetails,
  ) {
    super(`Provider request failed with status ${status}.`);
    this.name = "ProviderResponseError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

export class ProviderOutputError extends ProviderResponseError {
  readonly outcome: "incomplete" | "malformed";

  constructor(outcome: "incomplete" | "malformed") {
    super(200);
    this.outcome = outcome;
  }
}

export class MetaResponsesNotFound extends ProviderResponseError {
  constructor() {
    super(404);
  }
}

export async function isMetaModelNotFound(
  response: Response,
  signal: AbortSignal,
) {
  const parsed = z
    .object({ error: z.object({ code: z.literal("model_not_found") }) })
    .safeParse(await response.json().catch(() => null));
  signal.throwIfAborted();
  return parsed.success;
}

export async function metaResponsesError(
  response: Response,
  signal: AbortSignal,
) {
  const details = failureDetails(
    response.status,
    await readErrorBody(response, signal),
    readRate(response.headers),
  );
  if (response.status === 404 && details.upstreamCode !== "model_not_found")
    return new MetaResponsesNotFound();
  signal.throwIfAborted();
  return new ProviderResponseError(
    response.status,
    providerRetryAfter(response),
    details,
  );
}

export async function providerFetch(
  request: typeof fetch,
  url: string,
  init: RequestInit,
) {
  init.signal?.throwIfAborted();
  try {
    return await request(url, init);
  } catch {
    init.signal?.throwIfAborted();
    throw new ProviderResponseError(0);
  }
}

export function isProviderLimit(
  error: unknown,
): error is ProviderResponseError {
  return (
    error instanceof ProviderResponseError && [402, 429].includes(error.status)
  );
}

export function createProvider(
  key: string,
  model: string,
  request = fetch,
  vendor: "openai" | "meta" | "xai" = "openai",
  config: ProviderConfig = {},
): ReviewProvider {
  config = {
    schedule: createRateSchedule(),
    retryBudget: { remaining: 1 },
    ...config,
  };
  function verifierInfo(modelOverride?: string) {
    const verifier =
      vendor === "openai"
        ? (modelOverride ?? config.verifierModel)
        : config.verifierModel;
    return {
      model: verifier || model,
      distinct: Boolean(verifier && verifier !== model),
    };
  }

  async function respond(
    instructions: string,
    data: unknown,
    signal: AbortSignal,
    options: Record<string, unknown>,
    messages?: { role: "user" | "assistant"; content: string }[],
    stage = "structured_output",
  ) {
    const requestModel =
      "model" in options && typeof options.model === "string"
        ? options.model
        : model;
    // Only stable instructions and API options contribute to the routing key.
    const promptCacheKey =
      vendor === "meta"
        ? `tactile-v1-${createHash("sha256")
            .update(JSON.stringify([requestModel, instructions, options]))
            .digest("hex")
            .slice(0, 24)}`
        : undefined;
    const callSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(config.requestTimeoutMs ?? 35_000),
    ]);
    async function send(maxOutputTokens: number): Promise<unknown> {
      const endpoint = {
        meta: "https://api.meta.ai/v1/responses",
        openai: "https://api.openai.com/v1/responses",
        xai: "https://api.x.ai/v1/responses",
      }[vendor];
      const payload = await providerJson(
        request,
        endpoint,
        key,
        callSignal,
        {
          model: requestModel,
          instructions,
          input: messages
            ? messages.map(({ role, content }) => ({
                role,
                content: [
                  {
                    type: role === "assistant" ? "output_text" : "input_text",
                    text: content,
                  },
                ],
              }))
            : JSON.stringify(data),
          store: false,
          prompt_cache_key: promptCacheKey,
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
        },
        config,
        "Authorization",
        { vendor, stage, outputTokens: maxOutputTokens },
      );
      const usage = usageSchema.safeParse(payload);
      config.onUsage?.(
        {
          inputTokens: usage.success ? usage.data.usage.input_tokens : null,
          outputTokens: usage.success ? usage.data.usage.output_tokens : null,
          cachedInputTokens: usage.success
            ? (usage.data.usage.input_tokens_details?.cached_tokens ?? null)
            : null,
        },
        stage,
      );
      return payload;
    }
    const first = await send(5500);
    if (
      vendor !== "openai" &&
      z.object({ status: z.literal("incomplete") }).safeParse(first).success
    )
      throw new ProviderOutputError("incomplete");
    const exhausted = z
      .object({
        status: z.literal("incomplete"),
        incomplete_details: z.object({
          reason: z.literal("max_output_tokens"),
        }),
      })
      .safeParse(first).success;
    const payload =
      vendor === "openai" && exhausted && options.max_tool_calls !== 1
        ? await send(8500)
        : first;
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) throw new ProviderOutputError("malformed");
    const { output } = parsed.data;
    const outputText = output
      .flatMap(({ content }) => content ?? [])
      .flatMap((item) => {
        const parsed = textSchema.safeParse(item);
        return parsed.success && parsed.data.text.trim() ? [parsed.data] : [];
      });
    if (!outputText.length) throw new ProviderOutputError("malformed");
    return outputText;
  }

  return {
    modelId: model,
    verifierInfo,
    async structured<T>(
      instruction: string,
      data: unknown,
      schema: z.ZodType<T>,
      signal: AbortSignal,
      verification?: { model?: string },
    ) {
      const jsonSchema = z.toJSONSchema(schema);
      delete jsonSchema.$schema;
      const verifier = verification
        ? verifierInfo(verification.model).model
        : undefined;
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
      return structuredResult(result.map(({ text }) => text).join(""), schema);
    },

    async crossfireGenerate(instructions, messages, schema, signal) {
      const structured = vendor === "meta" && schema;
      const output = await respond(
        schema && !structured
          ? instructions +
              "\n\nReturn one valid JSON value matching this schema. " +
              JSON.stringify(schema)
          : instructions,
        null,
        signal,
        structured
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: "crossfire_result",
                  strict: false,
                  schema,
                },
              },
            }
          : {},
        messages,
        providerStage(schema),
      );
      return output.map(({ text }) => text).join("");
    },

    async research(instruction, data, signal, options) {
      const maxToolCalls = options?.maxToolCalls ?? 2;
      const result = await respond(
        instruction,
        data,
        signal,
        {
          ...(vendor !== "xai" ? { max_tool_calls: maxToolCalls } : {}),
          ...(vendor === "meta"
            ? {
                tools: [
                  {
                    type: "web_search",
                    search_context_size:
                      maxToolCalls === 1
                        ? "low"
                        : maxToolCalls === 3
                          ? "high"
                          : "medium",
                  },
                ],
              }
            : {
                tools: [{ type: "web_search" }],
                tool_choice: { type: "web_search" },
              }),
        },
        undefined,
        "evidence_search",
      );
      const citations = result.flatMap((item) =>
        citationsFromAnnotations(item.text, item.annotations),
      );
      return {
        text: result.map(({ text }) => text).join("\n"),
        citations: uniqueSourcesByUrl(citations).slice(0, 8),
      };
    },
  };
}

export function citationsFromAnnotations(
  text: string,
  annotations: unknown[],
): Citation[] {
  const citations: Citation[] = [];
  const characters = Array.from(text);
  for (const annotation of annotations) {
    const parsed = annotationSchema.safeParse(annotation);
    if (!parsed.success) continue;
    const { url, title, start_index, end_index } = parsed.data;
    if (end_index <= start_index || end_index > characters.length) continue;
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
        title: title || new URL(url).hostname,
        passage,
        anchor: characters.slice(start_index, end_index).join("").trim(),
        startIndex: start_index,
        endIndex: end_index,
      });
  }
  return citations;
}
