import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import {
  defaultReviewModel,
  reviewModels,
  reviewModelSchema,
} from "../shared/models.ts";
import {
  modelIdSchema,
  modelOptionSchema,
  providers,
  providerSchema,
} from "../shared/providers.ts";
import type { ProviderId } from "../shared/providers.ts";

const catalogSchema = z.object({
  models: z.array(modelOptionSchema),
  recommended: modelIdSchema.optional(),
});
const metaOptions = reviewModelSchema.options.map((id) => ({
  id,
  name: reviewModels[id].name,
}));
type KeyInput = {
  key?: string;
  model?: string;
  provider?: ProviderId;
  verification?: "generation";
  action?: "discover";
};
import { ThemeToggle } from "./Theme.tsx";
import { requestReference } from "./api.ts";

const stateSchema = z.object({
  saved: z.boolean(),
  expiresAt: z.number().optional(),
  model: modelIdSchema.default(defaultReviewModel),
  provider: providerSchema.default("meta"),
  verification: z.enum(["metadata", "generation"]).optional(),
});
type KeyState = z.infer<typeof stateSchema>;

class SettingsRequestError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function settingsRequest<T>(
  schema: z.ZodType<T>,
  token: string,
  method = "GET",
  input?: KeyInput,
  signal?: AbortSignal,
): Promise<T> {
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
  const parsed = schema.safeParse(result);
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
  const [vendor, setVendor] = useState<ProviderId>("meta");
  const [model, setModel] = useState<string>(defaultReviewModel);
  const [catalog, setCatalog] = useState<z.infer<typeof catalogSchema>>();
  const formRef = useRef<HTMLFormElement>(null);
  const provider = providers[vendor];
  const current =
    keyState?.saved && keyState.provider === vendor ? keyState : undefined;
  const models =
    catalog?.models ??
    (vendor === "meta"
      ? metaOptions
      : current
        ? [{ id: current.model, name: current.model }]
        : []);
  const recommended =
    catalog?.recommended ??
    (vendor === "meta" ? defaultReviewModel : undefined);
  const modelName = (id: string) =>
    models.find((option) => option.id === id)?.name ?? id;
  const selectable =
    current && !models.some(({ id }) => id === current.model)
      ? [{ id: current.model, name: current.model }, ...models]
      : models;
  const [keyEntered, setKeyEntered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [canTestModel, setCanTestModel] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    settingsRequest(
      stateSchema,
      token,
      "GET",
      undefined,
      controller.signal,
    ).then(
      (loaded) => {
        if (controller.signal.aborted) return;
        setKeyState(loaded);
        setVendor(loaded.provider);
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
    if (!key && (!current || keyEntered)) {
      setMessage("");
      setError(
        vendor === "meta"
          ? "Enter your Meta Model API key."
          : `Enter your ${provider.name} API key.`,
      );
      return;
    }
    setBusy(true);
    setCanTestModel(false);
    setError("");
    setMessage("");
    try {
      const saved = await settingsRequest(stateSchema, token, "POST", {
        provider: vendor === "meta" && !keyState?.saved ? undefined : vendor,
        key: key || undefined,
        model,
        verification: testGeneration ? "generation" : undefined,
      });
      form.reset();
      setKeyEntered(false);
      setKeyState(saved);
      setModel(saved.model);
      setMessage(
        saved.verification === "generation"
          ? "Model test passed. Key saved for this session."
          : key
            ? vendor === "meta"
              ? "Key saved for this session. Meta confirmed the model’s metadata."
              : `Key saved. New reviews will use ${provider.name} and ${modelName(saved.model)}.`
            : `Review model saved. New reviews will use ${modelName(saved.model)}.`,
      );
    } catch (cause) {
      setCanTestModel(
        cause instanceof SettingsRequestError &&
          cause.code === "provider_catalog",
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
      const removed = await settingsRequest(stateSchema, token, "DELETE");
      formRef.current?.reset();
      setKeyEntered(false);
      setKeyState(removed);
      setModel(vendor === "meta" ? removed.model : "");
      setCatalog(undefined);
      setMessage("Key removed.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove the key.",
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseProvider(next: ProviderId) {
    if (next === vendor) return;
    setVendor(next);
    setModel(
      keyState?.saved && keyState.provider === next
        ? keyState.model
        : next === "meta"
          ? defaultReviewModel
          : "",
    );
    setCatalog(undefined);
    formRef.current?.reset();
    setKeyEntered(false);
    setCanTestModel(false);
    setMessage("");
    setError("");
  }

  async function loadModels() {
    if (busy || !formRef.current) return;
    const key = new FormData(formRef.current)
      .get("meta-key")
      ?.toString()
      .trim();
    if (!key && !current) {
      setError(`Enter your ${provider.name} API key to load available models.`);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setCanTestModel(false);
    try {
      const loaded = await settingsRequest(catalogSchema, token, "POST", {
        action: "discover",
        provider: vendor,
        key: key || undefined,
      });
      setCatalog(loaded);
      setModel(
        current && loaded.models.some(({ id }) => id === current.model)
          ? current.model
          : (loaded.recommended ?? ""),
      );
      if (!loaded.models.length)
        setError("This key has no models that support Tactile reviews.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load provider models.",
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
            <p>Choose the provider and model for your live reviews.</p>
          </div>
          {keyState && (
            <span className="settings-key-status">
              {keyState.saved ? "Key saved" : "No key saved"}
            </span>
          )}
        </div>
        <fieldset
          className="model-picker provider-picker"
          disabled={busy || !keyState}
        >
          <legend>Provider</legend>
          <div className="model-options provider-options">
            {providerSchema.options.map((id) => (
              <label
                className="model-option provider-choice"
                data-tone={providers[id].tone}
                key={id}
              >
                <input
                  type="radio"
                  name="provider"
                  checked={vendor === id}
                  onChange={() => chooseProvider(id)}
                />
                <span
                  className={`provider-mark provider-mark-${id}`}
                  aria-hidden="true"
                />
                <strong>{providers[id].name}</strong>
              </label>
            ))}
          </div>
        </fieldset>
        {keyState?.saved && (
          <p className="settings-hint">
            Connected to {providers[keyState.provider].name}. New reviews use
            the saved model until you validate a different selection.
          </p>
        )}
        <form id="provider-key-form" onSubmit={save} ref={formRef}>
          {vendor === "meta" && !catalog && (
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
                      onChange={() => {
                        setModel(id);
                        setCanTestModel(false);
                      }}
                    />
                    <span>
                      <strong>{reviewModels[id].name}</strong>
                      <small>{reviewModels[id].use}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
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
              required={!current}
              disabled={busy}
              onChange={(event) => {
                setKeyEntered(event.target.value.length > 0);
                setCanTestModel(false);
                setCatalog(undefined);
                if (vendor !== "meta") setModel(current?.model ?? "");
              }}
              placeholder={
                current
                  ? "Enter a replacement key"
                  : `Enter your ${provider.name} API key`
              }
            />
            <button
              type="button"
              className="button"
              onClick={() => void loadModels()}
              disabled={busy || !keyState || (!keyEntered && !current)}
            >
              Load models
            </button>
          </div>
          {(vendor !== "meta" || catalog) && (
            <div className="provider-model-field">
              <label htmlFor="provider-model">Review model</label>
              <select
                id="provider-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={busy || !selectable.length}
              >
                <option value="">Load available models</option>
                {selectable.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                    {id === recommended ? " (recommended)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="actions">
            <button
              className="button primary"
              disabled={
                busy ||
                !keyState ||
                !model ||
                (current && !keyEntered && current.model === model)
              }
            >
              {busy
                ? "Checking…"
                : vendor !== "meta"
                  ? "Validate & save key"
                  : !current
                    ? "Save key"
                    : keyEntered
                      ? "Replace key"
                      : "Save model"}
            </button>
            {current && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void remove()}
              >
                Remove key
              </button>
            )}
          </div>
          <p className="settings-hint">
            <a href={provider.keys} target="_blank" rel="noreferrer">
              Get your {provider.name} API key
            </a>
            . Tactile keeps your key in this server session for up to eight
            hours or until you sign out.
          </p>
          {vendor === "groq" && (
            <p className="settings-hint">
              For a first free-tier review, choose one assumption and a small
              reviewer panel. Groq can limit larger reviews.
            </p>
          )}
          {vendor === "gemini" && (
            <p className="settings-hint">
              Gemini reviews use attached evidence and public reference search.
              Source gaps can leave findings unresolved.
            </p>
          )}
        </form>
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
              Rechecks model access first. If it remains inconclusive, sends one
              short prompt using your key and may incur a Meta charge.
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
