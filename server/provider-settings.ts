import { z } from "zod";
import { createProvider } from "./provider.ts";

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

function sessionKey(
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
    const id = sessionKey(account, token);
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
      const id = sessionKey(account, token);
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
      const id = sessionKey(account, token);
      if (id) keys.delete(id);
    },
    provider(account: string, token: string) {
      const entry = get(account, token);
      return entry
        ? createProvider(entry.key, "muse-spark-1.3", fetch, "meta", {
            verifierModel: metaVerifierModel,
          })
        : undefined;
    },
  };
}
