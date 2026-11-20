import { createClient } from "@supabase/supabase-js";

export interface PublicAuthConfig {
  url: string;
  publishableKey: string;
}

export function createSessionVerifier(config: PublicAuthConfig) {
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(5000) }),
    },
  });

  return async (token: string): Promise<string | null> => {
    const { data, error } = await client.auth.getUser(token);
    return error || data.user?.is_anonymous ? null : (data.user?.id ?? null);
  };
}

export async function reserveReview(
  config: PublicAuthConfig,
  token: string,
): Promise<boolean> {
  const response = await fetch(
    new URL("/rest/v1/rpc/reserve_tactile_review", config.url),
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("Review quota service is unavailable.");
  return (await response.json()) === true;
}
