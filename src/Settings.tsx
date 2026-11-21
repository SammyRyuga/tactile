import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { ThemeToggle } from "./Theme.tsx";

const stateSchema = z.object({
  saved: z.boolean(),
  expiresAt: z.number().optional(),
});
type KeyState = z.infer<typeof stateSchema>;

async function updateKey(
  token: string,
  method = "GET",
  key?: string,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/settings/provider", {
    method,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(key ? { "Content-Type": "application/json" } : {}),
    },
    body: key ? JSON.stringify({ key }) : undefined,
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ message: z.string() }).safeParse(result);
    throw new Error(
      error.success ? error.data.message : "Could not update the provider key.",
    );
  }
  return stateSchema.parse(result);
}

export function Settings({
  token,
  email,
  signOut,
  notice,
}: {
  token: string;
  email?: string;
  signOut: () => Promise<void>;
  notice: string;
}) {
  const [keyState, setKeyState] = useState<KeyState>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    updateKey(token, "GET", undefined, controller.signal).then(
      setKeyState,
      (cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the provider settings.",
          );
      },
    );
    return () => controller.abort();
  }, [token]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const key = new FormData(form).get("meta-key")?.toString().trim();
    if (!key) return;
    form.reset();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setKeyState(await updateKey(token, "POST", key));
      setMessage("Key validated and saved for this session.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the key.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setKeyState(await updateKey(token, "DELETE"));
      setMessage("Key removed.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove the key.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="content" className="workspace settings-page">
      <div className="settings-title">
        <h1>Settings</h1>
        <a href="/review" className="button">
          Back to workspace
        </a>
      </div>

      <section
        className="panel settings-row"
        aria-labelledby="appearance-title"
      >
        <div>
          <h2 id="appearance-title">Appearance</h2>
          <p>Your preference is saved on this device.</p>
        </div>
        <ThemeToggle showLabel />
      </section>

      <section
        className="panel settings-provider"
        aria-labelledby="provider-title"
      >
        <div className="settings-row">
          <div>
            <h2 id="provider-title">Meta Model API</h2>
            <p>Use your own key to review new proposals with Muse Spark.</p>
          </div>
          {keyState && (
            <span className="settings-key-status">
              {keyState.saved ? "Key saved" : "No key saved"}
            </span>
          )}
        </div>
        <form onSubmit={save}>
          <label htmlFor="meta-key">API key</label>
          <div className="settings-key-field">
            <input
              type="password"
              name="meta-key"
              id="meta-key"
              autoComplete="off"
              spellCheck={false}
              minLength={12}
              maxLength={512}
              required
              placeholder={
                keyState?.saved
                  ? "Enter a replacement key"
                  : "Enter your Meta Model API key"
              }
            />
            <button className="button primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : keyState?.saved
                  ? "Replace key"
                  : "Save key"}
            </button>
          </div>
          <p className="settings-hint">
            Tactile checks the key with Meta before saving it for up to eight
            hours. Signing out or restarting the server clears it. Meta bills
            usage to the key’s account.
          </p>
        </form>
        {keyState?.saved && (
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void remove()}
          >
            Remove key
          </button>
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="panel settings-row" aria-labelledby="account-title">
        <div>
          <h2 id="account-title">Account</h2>
          <p>{email ?? "Signed in"}</p>
        </div>
        <button type="button" className="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>
      {notice && (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
    </main>
  );
}
