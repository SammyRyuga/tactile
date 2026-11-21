import { z } from "zod";
import { createProvider, metaStructuredEffort } from "./provider.ts";

const metaModel = "muse-spark-1.3";
const maxSessions = 500;
const lifetime = 8 * 60 * 60 * 1000;

export const personalKeySchema = z.object({
  key: z
    .string()
    .trim()
    .min(12)
    .max(512)
    .regex(/^[!-~]+$/),
});

export async function validateMetaKey(
  key: string,
  signal: AbortSignal,
  request = fetch,
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
      model: metaModel,
      input: "Reply with OK.",
      store: false,
      max_output_tokens: 64,
      reasoning: { effort: metaStructuredEffort },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return response.status;
  }
  const result = z
    .object({ status: z.enum(["completed", "incomplete"]) })
    .safeParse(await response.json());
  return result.success ? 200 : 502;
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

export function createProviderSettings(metaVerifierModel?: string) {
  const keys = new Map<string, { key: string; expiresAt: number }>();
  function get(account: string, token: string) {
    const id = providerSessionId(account, token);
    if (!id) return undefined;
    const entry = keys.get(id);
    if (entry && entry.expiresAt <= Date.now()) {
      keys.delete(id);
      return undefined;
    }
    return entry;
  }

  return {
    get,
    save(account: string, token: string, key: string) {
      const id = providerSessionId(account, token);
      if (!id) return undefined;
      const now = Date.now();
      for (const [key, entry] of keys) {
        if (entry.expiresAt <= now) keys.delete(key);
      }
      if (!keys.has(id) && keys.size >= maxSessions) return undefined;
      const expiresAt = now + lifetime;
      keys.set(id, { key, expiresAt });
      setTimeout(() => {
        if (keys.get(id)?.expiresAt === expiresAt) keys.delete(id);
      }, lifetime).unref();
      return expiresAt;
    },
    clear(account: string, token: string) {
      const id = providerSessionId(account, token);
      if (id) keys.delete(id);
    },
    provider(account: string, token: string) {
      const entry = get(account, token);
      return entry
        ? createProvider(entry.key, metaModel, fetch, "meta", {
            verifierModel: metaVerifierModel,
          })
        : undefined;
    },
  };
}
