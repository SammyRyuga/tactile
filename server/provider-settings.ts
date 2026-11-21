import { createHash } from "node:crypto";
import type { Claim } from "../shared/review.ts";
import { z } from "zod";
import {
  createProvider,
  metaStructuredEffort,
  providerRetryAfter,
} from "./provider.ts";

import { defaultReviewModel, reviewModelSchema } from "../shared/models.ts";
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
});

export async function validateMetaKey(
  key: string,
  signal: AbortSignal,
  request = fetch,
  model: ReviewModel = defaultReviewModel,
) {
  const response = await request("https://api.meta.ai/v1/responses", {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal,
    body: JSON.stringify({
      model,
      input: "Reply with OK.",
      store: false,
      max_output_tokens: 64,
      reasoning: { effort: metaStructuredEffort },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return {
      status: response.status,
      retryAfter: providerRetryAfter(response),
    };
  }
  const result = z
    .object({ status: z.enum(["completed", "incomplete"]) })
    .safeParse(await response.json());
  return { status: result.success ? 200 : 502 };
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

export function createProviderSettings(
  metaVerifierModel?: string,
  request = fetch,
) {
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
            verifierModel: metaVerifierModel,
            onUsage,
          })
        : undefined;
    },
  };
}
