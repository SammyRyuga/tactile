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
