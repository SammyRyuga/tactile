import { createHash } from "node:crypto";
import type { Claim } from "../shared/review.ts";
import { z } from "zod";
import {
  createProvider,
  isMetaModelNotFound,
  metaResponsesError,
  ProviderOutputError,
  providerFetch,
  providerRetryAfter,
  ProviderResponseError,
  metaStructuredEffort,
} from "./provider.ts";
import { reviewModelSchema } from "../shared/models.ts";
import type { ReviewModel } from "../shared/models.ts";
const maxSessions = 500;
const lifetime = 8 * 60 * 60 * 1000;

export const personalKeySchema = z.object({
  key: z
    .string()
    .trim()
    .min(12)
    .max(512)
    .regex(/^[!-~]+$/)
    .optional(),
  model: reviewModelSchema.optional(),
  verification: z.literal("generation").optional(),
});

const metaModelList = z.object({
  object: z.literal("list"),
  data: z.array(z.object({ id: z.string() })),
});

const metaModel = z.object({
  object: z.literal("model"),
  id: z.string(),
});
type CatalogOutcome =
  | "endpoint_not_found"
  | "invalid_catalog"
  | "model_not_listed";

export class MetaModelLookupError extends ProviderResponseError {
  readonly catalogOutcome: CatalogOutcome;
  readonly confirmedMissing: boolean;

  constructor(
    confirmedMissing: boolean,
    catalogOutcome: CatalogOutcome,
    detailStatus: number,
  ) {
    super(detailStatus);
    this.confirmedMissing = confirmedMissing;
    this.catalogOutcome = catalogOutcome;
  }
}

export async function validateMetaKey(
  key: string,
  model: ReviewModel,
  signal: AbortSignal,
  request = fetch,
) {
  const catalogUrl = "https://api.meta.ai/v1/models";
  const options = {
    method: "GET",
    redirect: "error",
    headers: { Authorization: "Bearer " + key },
    signal,
  } as const;
  const catalog = await providerFetch(request, catalogUrl, options);
  let catalogOutcome: CatalogOutcome;
  if (catalog.ok) {
    const parsed = metaModelList.safeParse(
      await catalog.json().catch(() => null),
    );
    signal.throwIfAborted();
    if (parsed.success && parsed.data.data.some(({ id }) => id === model))
      return;
    catalogOutcome = parsed.success ? "model_not_listed" : "invalid_catalog";
  } else {
    await catalog.body?.cancel();
    if (catalog.status !== 404)
      throw new ProviderResponseError(
        catalog.status,
        providerRetryAfter(catalog),
      );
    catalogOutcome = "endpoint_not_found";
  }

  const detail = await providerFetch(
    request,
    `${catalogUrl}/${encodeURIComponent(model)}`,
    options,
  );
  if (detail.ok) {
    const parsed = metaModel.safeParse(await detail.json().catch(() => null));
    signal.throwIfAborted();
    if (parsed.success && parsed.data.id === model) return catalogOutcome;
    throw new MetaModelLookupError(false, catalogOutcome, detail.status);
  }
  if (detail.status === 404) {
    const confirmedMissing = await isMetaModelNotFound(detail, signal);
    throw new MetaModelLookupError(
      confirmedMissing,
      catalogOutcome,
      detail.status,
    );
  }
  await detail.body?.cancel();
  throw new ProviderResponseError(detail.status, providerRetryAfter(detail));
}

const metaTestResult = z.object({
  status: z.literal("completed"),
  model: z.string(),
  output: z.array(
    z.object({
      type: z.string(),
      role: z.string().optional(),
      content: z.array(z.unknown()).optional(),
    }),
  ),
});
const metaTestText = z.object({
  type: z.literal("output_text"),
  text: z.string().trim().min(1),
});

export async function testMetaGeneration(
  key: string,
  model: ReviewModel,
  signal: AbortSignal,
  request = fetch,
) {
  const response = await providerFetch(
    request,
    "https://api.meta.ai/v1/responses",
    {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: "Reply with OK.",
        reasoning: { effort: metaStructuredEffort },
        max_output_tokens: 256,
        store: false,
      }),
      signal,
    },
  );
  if (!response.ok) throw await metaResponsesError(response, signal);
  const output: unknown = await response.json().catch(() => null);
  signal.throwIfAborted();
  if (z.object({ status: z.literal("incomplete") }).safeParse(output).success)
    throw new ProviderOutputError("incomplete");
  const parsed = metaTestResult.safeParse(output);
  if (
    !parsed.success ||
    parsed.data.model !== model ||
    !parsed.data.output.some(
      ({ type, role, content }) =>
        type === "message" &&
        role === "assistant" &&
        content?.some((part) => metaTestText.safeParse(part).success),
    )
  )
    throw new ProviderOutputError("malformed");
}

export function providerSessionId(
  account: string,
  verifiedToken: string,
): string | undefined {
  try {
    const payload = JSON.parse(
      Buffer.from(verifiedToken.split(".")[1], "base64url").toString("utf8"),
    );
    const claims = z.object({ session_id: z.uuid() }).parse(payload);
    return `${account}:${claims.session_id}`;
  } catch {
    return undefined;
  }
}

function createClaimCache() {
  const lifetime = 5 * 60 * 1000;
  const entries = new Map<string, { claims: Claim[]; expiresAt: number }>();
  const digest = (proposal: string) =>
    createHash("sha256").update(proposal).digest("hex");
  let active = true;

  return {
    get(proposal: string) {
      const key = digest(proposal);
      const entry = entries.get(key);
      if (entry && entry.expiresAt > Date.now()) return entry.claims;
      entries.delete(key);
      return undefined;
    },
    add(proposal: string, claims: Claim[]) {
      if (!active) return;
      const key = digest(proposal);
      entries.delete(key);
      const expiresAt = Date.now() + lifetime;
      entries.set(key, { claims, expiresAt });
      if (entries.size > 6) {
        const oldest = entries.keys().next().value;
        if (oldest) entries.delete(oldest);
      }
      setTimeout(() => {
        if (entries.get(key)?.expiresAt === expiresAt) entries.delete(key);
      }, lifetime).unref();
    },
    clear() {
      active = false;
      entries.clear();
    },
  };
}

export type ClaimCache = ReturnType<typeof createClaimCache>;

export function createProviderSettings(request = fetch) {
  const keys = new Map<
    string,
    {
      key: string;
      model: ReviewModel;
      expiresAt: number;
      generation: symbol;
      claims: ClaimCache;
    }
  >();
  function get(account: string, token: string) {
    const id = providerSessionId(account, token);
    if (!id) return undefined;
    const entry = keys.get(id);
    if (entry && entry.expiresAt <= Date.now()) {
      entry.claims.clear();
      keys.delete(id);
      return undefined;
    }
    return entry;
  }

  return {
    get,
    save(
      account: string,
      token: string,
      key: string,
      model: ReviewModel,
      expiresAt?: number,
    ) {
      const id = providerSessionId(account, token);
      if (!id) return undefined;
      const now = Date.now();
      for (const [key, entry] of keys) {
        if (entry.expiresAt <= now) {
          entry.claims.clear();
          keys.delete(key);
        }
      }
      if (!keys.has(id) && keys.size >= maxSessions) return undefined;
      const deadline = expiresAt ?? now + lifetime;
      if (deadline <= now) return undefined;
      keys.get(id)?.claims.clear();
      const generation = Symbol();
      keys.set(id, {
        key,
        model,
        generation,
        expiresAt: deadline,
        claims: createClaimCache(),
      });
      setTimeout(() => {
        const current = keys.get(id);
        if (current?.generation === generation) {
          current.claims.clear();
          keys.delete(id);
        }
      }, deadline - now).unref();
      return deadline;
    },
    clear(account: string, token: string) {
      const id = providerSessionId(account, token);
      if (id) {
        keys.get(id)?.claims.clear();
        keys.delete(id);
      }
    },
    provider(
      account: string,
      token: string,
      onUsage: NonNullable<
        Parameters<typeof createProvider>[4]
      >["onUsage"] = undefined,
    ) {
      const entry = get(account, token);
      return entry
        ? createProvider(entry.key, entry.model, request, "meta", {
            onUsage,
          })
        : undefined;
    },
  };
}
