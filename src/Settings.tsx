import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import {
  defaultReviewModel,
  reviewModels,
  reviewModelSchema,
} from "../shared/models.ts";
import type { ReviewModel } from "../shared/models.ts";
import { ThemeToggle } from "./Theme.tsx";
import { requestReference } from "./api.ts";

const stateSchema = z.object({
  saved: z.boolean(),
  expiresAt: z.number().optional(),
  model: reviewModelSchema.default(defaultReviewModel),
});
type KeyState = z.infer<typeof stateSchema>;

class SettingsRequestError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function updateKey(
  token: string,
  method = "GET",
  input?: { key?: string; model: ReviewModel; verification?: "generation" },
  signal?: AbortSignal,
) {
  const response = await fetch("/api/settings/provider", {
    method,
    signal: signal ?? AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input ? { "Content-Type": "application/json" } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z
      .object({ message: z.string(), code: z.string().optional() })
      .safeParse(result);
    throw new SettingsRequestError(
      (error.success
        ? error.data.message
        : "Could not update the provider key.") + requestReference(response),
      error.success ? error.data.code : undefined,
    );
  }
  const parsed = stateSchema.safeParse(result);
  if (!parsed.success)
    throw new Error(
      "Tactile returned an unexpected settings response. Refresh and try again.",
    );
  return parsed.data;
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
  const [model, setModel] = useState<ReviewModel>(defaultReviewModel);
  const [keyEntered, setKeyEntered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [canTestModel, setCanTestModel] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    updateKey(token, "GET", undefined, controller.signal).then(
      (loaded) => {
        if (controller.signal.aborted) return;
        setKeyState(loaded);
        setModel(loaded.model);
      },
      (cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your review settings. Refresh this page and try again.",
          );
      },
    );
    return () => controller.abort();
  }, [token]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const formData = new FormData(
      form,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    const key = formData.get("meta-key")?.toString().trim();
    const testGeneration = formData.get("verification") === "generation";
    if (!key && (!keyState?.saved || keyEntered)) {
      setMessage("");
      setError("Enter your Meta Model API key.");
      return;
    }
    setBusy(true);
    setCanTestModel(false);
    setError("");
    setMessage("");
    try {
      const saved = await updateKey(token, "POST", {
        key: key || undefined,
        model,
        verification: testGeneration ? "generation" : undefined,
      });
      form.reset();
      setKeyEntered(false);
      setKeyState(saved);
      setModel(saved.model);
      setMessage(
        key
          ? testGeneration
            ? "Model test passed. Key saved for this session."
            : "Key saved for this session. Meta verified the selected model."
          : `Review model saved. New reviews will use ${reviewModels[saved.model].name}.`,
      );
    } catch (cause) {
      setCanTestModel(
        cause instanceof SettingsRequestError &&
          (cause.code === "provider_model" ||
            cause.code === "provider_catalog"),
      );
      setError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "Settings did not respond in time. Try saving again."
          : cause instanceof TypeError
            ? "Tactile could not be reached. Check your connection and try again."
            : cause instanceof Error
              ? cause.message
              : "Could not save the key.",
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
      const removed = await updateKey(token, "DELETE");
      setKeyState(removed);
      setModel(removed.model);
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
            <h2 id="provider-title">Live reviews</h2>
            <p>Pick a Meta model and use your own API key to run it.</p>
          </div>
          {keyState && (
            <span className="settings-key-status">
              {keyState.saved ? "Key saved" : "No key saved"}
            </span>
          )}
        </div>
        <form id="provider-key-form" onSubmit={save}>
          <fieldset className="model-picker" disabled={busy || !keyState}>
            <legend>Review model</legend>
            <div className="model-options">
              {reviewModelSchema.options.map((id) => (
                <label
                  className="model-option"
                  data-tone={reviewModels[id].tone}
                  key={id}
                >
                  <input
                    type="radio"
                    name="review-model"
                    value={id}
                    checked={model === id}
                    onChange={() => setModel(id)}
                  />
                  <span>
                    <strong>{reviewModels[id].name}</strong>
                    <small>{reviewModels[id].use}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {keyState?.saved && (
            <p className="settings-hint">
              Using {reviewModels[keyState.model].name}. Save a new choice to
              use it for your next review.
            </p>
          )}
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
              required={!keyState?.saved}
              disabled={busy}
              onChange={(event) => setKeyEntered(event.target.value.length > 0)}
              placeholder={
                keyState?.saved
                  ? "Enter a replacement key"
                  : "Enter your Meta Model API key"
              }
            />
            <button
              className="button primary"
              disabled={
                busy ||
                !keyState ||
                (keyState.saved && !keyEntered && keyState.model === model)
              }
            >
              {busy
                ? "Checking with Meta…"
                : !keyState?.saved
                  ? "Save key"
                  : keyEntered
                    ? "Replace key"
                    : "Save model"}
            </button>
          </div>
          <p className="settings-hint">
            Your key lets Tactile run reviews on your Meta account.{" "}
            <a
              href="https://dev.meta.ai/docs/authentication#get-an-api-key"
              target="_blank"
              rel="noreferrer"
            >
              Get a Meta API key
            </a>
            . Tactile keeps your key for up to eight hours or until you sign
            out.
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
        {canTestModel && (
          <div className="actions">
            <button
              className="button"
              type="submit"
              form="provider-key-form"
              name="verification"
              value="generation"
              aria-describedby="meta-test-note"
              disabled={busy}
            >
              Test model and save
            </button>
            <p className="field-note" id="meta-test-note">
              Sends one short prompt to Meta using your key and may use a small
              amount of your API quota.
            </p>
          </div>
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
