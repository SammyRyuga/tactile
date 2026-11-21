import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { App } from "./App.tsx";
import { ThemeToggle } from "./Theme.tsx";
import { Settings } from "./Settings.tsx";
import { Home } from "./Home.tsx";
import { demoExamples } from "../shared/demo.ts";

const authConfig = z.object({
  auth: z
    .object({ url: z.url(), publishableKey: z.string().min(1) })
    .nullable(),
});

function Header({ session }: { session: Session | null }) {
  return (
    <header className="topbar site-nav">
      <div className="topbar-body">
        <a className="wordmark" href="/">
          <span className="logo" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 18h5v-5h5V8h5V3h3" />
            </svg>
          </span>
          Tactile
        </a>
        <nav aria-label="Main navigation">
          <a className="nav-section" href="/#examples">
            Cases
          </a>
          <a className="nav-section" href="/#method">
            Method
          </a>
          <a href="/review">Workspace</a>
          <ThemeToggle />
          <a href={session ? "/settings" : "/login"}>
            {session ? "Settings" : "Sign in"}
          </a>
        </nav>
      </div>
    </header>
  );
}

function Login({
  client,
  session,
  loading,
  next,
}: {
  client: SupabaseClient | null;
  session: Session | null;
  loading: boolean;
  next: string;
}) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = creating
        ? await client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + "/login" },
          })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        setFailed(true);
        setMessage(
          creating
            ? "Account creation could not be completed. Check the email and password or try again later."
            : "Sign-in failed. Check your details and confirm your email before retrying.",
        );
      } else if (result.data.session) {
        window.location.assign(next);
      } else if (creating) {
        setMessage(
          "Check your email to confirm your account, then return to sign in.",
        );
      }
    } catch {
      setFailed(true);
      setMessage(
        "The sign-in service is temporarily unavailable. Try again shortly.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="content" className="workspace auth-page">
      <section className="panel">
        <h1>
          {session
            ? "You’re signed in"
            : creating
              ? "Create your account"
              : "Sign in to Tactile"}
        </h1>
        <p className="field-note">
          Bring your own Meta Model API key for live reviews. After signing in,
          add it in Settings. You can also{" "}
          <a href="/demo">try a bundled example</a>.
        </p>
        {session ? (
          <a className="button primary" href={next}>
            Continue to Tactile
          </a>
        ) : loading ? (
          <p role="status">Connecting to sign-in…</p>
        ) : !client ? (
          <p role="status">Sign-in is unavailable. Try again later.</p>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              minLength={creating ? 8 : undefined}
              required
              aria-describedby={creating ? "password-note" : undefined}
            />
            {creating && (
              <p className="field-note" id="password-note">
                Use at least 8 characters.
              </p>
            )}
            {message && (
              <p
                className={failed ? "error" : "field-note"}
                role={failed ? "alert" : "status"}
              >
                {message}
              </p>
            )}
            <div className="actions">
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : creating
                    ? "Create account"
                    : "Sign in"}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setCreating(!creating);
                  setMessage("");
                }}
              >
                {creating ? "Back to sign in" : "Create an account"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function allowedDestination(value: string | null) {
  if (!value) return "/review";
  if (value === "/settings") return value;
  if (value === "/review") return value;
  const example = demoExamples.find(
    ({ id }) => value === `/review?example=${id}`,
  );
  return example ? `/review?example=${example.id}` : "/review";
}

export function Site() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const path = window.location.pathname;
  const publicExample = path === "/demo";
  const params = new URLSearchParams(window.location.search);
  const protectedRoute = path === "/review" || path === "/settings";
  const exampleId =
    params.get("example") ?? (params.get("demo") === "1" ? "ci" : null);
  const example =
    path === "/review"
      ? demoExamples.find(({ id }) => id === exampleId)
      : undefined;
  const requested =
    path === "/settings"
      ? path
      : example
        ? `/review?example=${example.id}`
        : "/review";
  const next = allowedDestination(params.get("next"));

  useEffect(() => {
    if (publicExample) return;
    const controller = new AbortController();
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const response = await fetch("/api/auth-config", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        if (!response.ok)
          throw new Error("Sign-in configuration is unavailable.");
        const { auth } = authConfig.parse(await response.json());
        if (!auth || controller.signal.aborted) return;
        const { createClient } = await import("@supabase/supabase-js");
        if (controller.signal.aborted) return;
        const supabase = createClient(auth.url, auth.publishableKey, {
          auth: { storage: window.sessionStorage },
          global: {
            fetch: (input, init) =>
              fetch(input, {
                ...init,
                signal: AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(8000),
                  ...(init?.signal ? [init.signal] : []),
                ]),
              }),
          },
        });
        setClient(supabase);
        const { data } = await supabase.auth.getSession();
        if (controller.signal.aborted) return;
        if (data.session) {
          const user = protectedRoute
            ? await supabase.auth.getUser(data.session.access_token)
            : { data: { user: data.session.user } };
          if (
            "error" in user &&
            user.error &&
            (!user.error.status ||
              user.error.status === 429 ||
              user.error.status >= 500)
          )
            throw new Error("Sign-in verification is temporarily unavailable.");
          if (
            !controller.signal.aborted &&
            user.data.user &&
            !user.data.user.is_anonymous
          )
            setSession(data.session);
        }
        if (controller.signal.aborted) return;
        const changes = supabase.auth.onAuthStateChange((event, updated) => {
          if (controller.signal.aborted || event === "INITIAL_SESSION") return;
          if (!updated) setSession(null);
          else
            setSession((current) =>
              current?.user.id === updated.user.id ? updated : current,
            );
        });
        unsubscribe = () => changes.data.subscription.unsubscribe();
      } catch {
        if (!controller.signal.aborted) {
          setClient(null);
          setAuthUnavailable(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [protectedRoute, publicExample]);

  useEffect(() => {
    if (protectedRoute && !loading && !session && !authUnavailable) {
      window.location.replace(
        `/login?${new URLSearchParams({ next: requested })}`,
      );
    }
  }, [protectedRoute, loading, session, requested, authUnavailable]);

  async function signOut() {
    try {
      if (session) {
        await fetch("/api/settings/provider", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: AbortSignal.timeout(3000),
        }).catch(() => undefined);
      }
      const result = await client?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
      if (session?.user.id) {
        try {
          const prefix = `tactile-review-v1:${session.user.id}:`;
          for (let index = sessionStorage.length - 1; index >= 0; index--) {
            const key = sessionStorage.key(index);
            if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
          }
        } catch {
          // Storage can be disabled.
        }
      }
      window.location.assign("/");
    } catch {
      setNotice("Sign-out failed. Try again.");
    }
  }

  if (publicExample) {
    return (
      <App
        preview
        startExample={false}
        initialExample={
          demoExamples.find(({ id }) => id === exampleId) ??
          demoExamples.find(({ id }) => id === "flag")
        }
      />
    );
  }

  if (protectedRoute && (loading || !session)) {
    return (
      <main className="workspace">
        {authUnavailable ? (
          <>
            <p role="alert">Sign-in verification is temporarily unavailable.</p>
            <div className="actions">
              <button
                className="button"
                onClick={() => window.location.reload()}
              >
                Retry verification
              </button>
              <a href="/demo">Try a bundled example</a>
            </div>
          </>
        ) : (
          <p role="status">
            {loading ? "Checking your session…" : "Opening sign-in…"}
          </p>
        )}
      </main>
    );
  }

  if (path === "/review" && session) {
    return (
      <>
        {notice && (
          <p className="workspace error" role="alert">
            {notice}
          </p>
        )}
        <App
          key={session.user.id}
          token={session.access_token}
          account={session.user.email}
          accountId={session.user.id}
          startExample={Boolean(example)}
          initialExample={example?.id === "ci" ? undefined : example}
          signOut={signOut}
        />
      </>
    );
  }
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <Header session={session} />
      {path === "/login" ? (
        <Login
          client={client}
          session={session}
          loading={loading}
          next={next}
        />
      ) : path === "/settings" && session ? (
        <Settings
          token={session.access_token}
          email={session.user.email}
          signOut={signOut}
          notice={notice}
        />
      ) : (
        <Home signedIn={Boolean(session)} />
      )}
    </>
  );
}
