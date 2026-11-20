import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { App } from "./App.tsx";

const authConfig = z.object({
  auth: z
    .object({ url: z.url(), publishableKey: z.string().min(1) })
    .nullable(),
});

function Header({ session }: { session: Session | null }) {
  return (
    <header className="topbar">
      <div className="topbar-body">
        <a className="wordmark" href="/">
          <span className="logo" aria-hidden="true">
            ↗
          </span>
          Tactile
        </a>
        <nav aria-label="Main navigation">
          <a href="/review">Review</a>
          <a href={session ? "/review" : "/login"}>
            {session ? "Account" : "Sign in"}
          </a>
        </nav>
      </div>
    </header>
  );
}

function Home({ session }: { session: Session | null }) {
  return (
    <main id="content" className="workspace landing">
      <section className="landing-hero">
        <div>
          <h1>Make better engineering decisions.</h1>
          <p>
            Find the assumptions your proposal depends on. Check what holds up,
            what needs evidence, and what to try next.
          </p>
          <div className="actions">
            <a className="button primary" href={session ? "/review" : "/login"}>
              {session ? "Start a review" : "Sign in"}
            </a>
            <a className="button" href="/review?demo=1">
              Try the demo
            </a>
          </div>
        </div>
        <aside className="panel landing-example" aria-label="Example decision">
          <p className="landing-label">Example decision</p>
          <h2>Should we run fewer tests on each pull request?</h2>
          <div className="sample-finding">
            <span className="verdict contradicted">Contradicted</span>
            <p>
              Testing only the changed package can miss failures in a package
              that depends on it.
            </p>
          </div>
          <a href="/review?demo=1">Review this example →</a>
        </aside>
      </section>
      <section className="landing-how" aria-labelledby="how-title">
        <h2 id="how-title">How a review works</h2>
        <ol>
          <li>
            <h3>Describe a change</h3>
            <p>Include the current setup and the outcome you expect.</p>
          </li>
          <li>
            <h3>Confirm the claims</h3>
            <p>
              Choose the assumptions that would change your decision if they
              failed.
            </p>
          </li>
          <li>
            <h3>Review the evidence</h3>
            <p>Read the findings and export a Markdown report for your team.</p>
          </li>
        </ol>
      </section>
      <footer>
        Built by <a href="https://github.com/ryanfer123">ryanfer123</a> and{" "}
        <a href="https://github.com/SammyRyuga">SammyRyuga</a> ·{" "}
        <a href="https://github.com/SammyRyuga/tactile">GitHub</a>
      </footer>
    </main>
  );
}

function Login({
  client,
  session,
  loading,
}: {
  client: SupabaseClient | null;
  session: Session | null;
  loading: boolean;
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
        window.location.assign("/review");
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
        {session ? (
          <a className="button primary" href="/review">
            Open the review workspace
          </a>
        ) : loading ? (
          <p role="status">Connecting to sign-in…</p>
        ) : !client ? (
          <p role="status">
            Sign-in is unavailable. You can still open the demo.
          </p>
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
        <a className="login-demo" href="/review?demo=1">
          Try the demo without an account →
        </a>
      </section>
    </main>
  );
}

export function Site() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const path = window.location.pathname;

  useEffect(() => {
    const controller = new AbortController();
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      try {
        const response = await fetch("/api/auth-config", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { auth } = authConfig.parse(await response.json());
        if (!auth || controller.signal.aborted) return;
        const { createClient } = await import("@supabase/supabase-js");
        if (controller.signal.aborted) return;
        const supabase = createClient(auth.url, auth.publishableKey, {
          auth: { storage: window.sessionStorage },
        });
        setClient(supabase);
        const { data } = supabase.auth.onAuthStateChange((_event, next) => {
          if (!controller.signal.aborted) setSession(next);
        });
        unsubscribe = () => data.subscription.unsubscribe();
        await supabase.auth.getSession();
      } catch {
        if (!controller.signal.aborted) setClient(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, []);

  if (path === "/review") {
    const demo =
      new URLSearchParams(window.location.search).get("demo") === "1";
    if (loading)
      return (
        <p className="workspace field-note" role="status">
          Opening the review workspace…
        </p>
      );
    return (
      <>
        {notice && (
          <p className="workspace error" role="alert">
            {notice}
          </p>
        )}
        <App
          key={session?.user.id ?? "guest"}
          token={session?.access_token}
          account={session?.user.email}
          accountId={session?.user.id}
          needsSignIn={Boolean(client && !session)}
          startDemo={demo}
          signOut={async () => {
            try {
              const result = await client?.auth.signOut({ scope: "local" });
              if (result?.error) throw result.error;
              if (session?.user.id) {
                try {
                  for (const kind of ["workspace", "example"]) {
                    sessionStorage.removeItem(
                      `tactile-review-v1:${session.user.id}:${kind}`,
                    );
                  }
                } catch {
                  /* Storage can be disabled. */
                }
              }
              window.location.assign("/");
            } catch {
              setNotice("Sign-out failed. Try again.");
            }
          }}
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
        <Login client={client} session={session} loading={loading} />
      ) : (
        <Home session={session} />
      )}
    </>
  );
}
