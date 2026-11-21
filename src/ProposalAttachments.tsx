import { useEffect, useId, useRef, useState } from "react";
import { limits } from "../shared/review.ts";
import type { ProjectEvidence } from "../shared/review.ts";
import { importAttachment } from "./api.ts";

export function ProposalAttachments({
  value,
  onChange,
  onBusyChange,
  disabled,
  token,
}: {
  value: ProjectEvidence[];
  onChange: (value: ProjectEvidence[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
  token?: string;
}) {
  const urlId = useId();
  const fileId = useId();
  const [url, setUrl] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const full = value.length >= limits.evidenceItems;
  useEffect(() => () => pending.current?.abort(), []);

  async function add(
    title: string,
    read: (
      signal: AbortSignal,
    ) => Promise<{ text: string; truncated: boolean }>,
    referenceUrl?: string,
  ) {
    if (disabled || full || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setReading(true);
    onBusyChange(true);
    setError("");
    setMessage("Reading attachment…");
    try {
      const { text, truncated } = await read(controller.signal);
      if (controller.signal.aborted) return;
      if (text.trim().length < 12)
        throw new Error("This attachment has too little readable text.");
      onChange([
        ...value,
        {
          id: crypto.randomUUID(),
          title: title.slice(0, 100),
          text: text.trim(),
          referenceUrl,
        },
      ]);
      setMessage(
        truncated ? "Added the first 2,400 characters." : "Attachment added.",
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        setMessage("");
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not read the attachment.",
        );
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        onBusyChange(false);
        if (!controller.signal.aborted) setReading(false);
      }
    }
  }

  async function addUrl() {
    const target = url.trim();
    const parsed = URL.parse(
      /^[a-z][a-z\d+.-]*:/i.test(target) ? target : `https://${target}`,
    );
    if (
      !parsed ||
      parsed.protocol !== "https:" ||
      !parsed.hostname.includes(".")
    ) {
      setError("Enter a public HTTPS page link.");
      return;
    }
    await add(
      parsed.hostname,
      (signal) => importAttachment({ url: parsed.href }, signal, token),
      parsed.href,
    );
  }

  function addFile(file: File) {
    if (!file.size || file.size > limits.attachmentBytes) {
      setError("Choose a non-empty file up to 4 MB.");
      return;
    }
    if (/\.(md|markdown|txt|text)$/i.test(file.name)) {
      void add(file.name, async () => {
        const text = (await file.text()).trim();
        return {
          text: text.slice(0, limits.evidenceText),
          truncated: text.length > limits.evidenceText,
        };
      });
    } else if (/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      const kind = /\.pdf$/i.test(file.name) ? "pdf" : "image";
      void add(file.name, (signal) =>
        importAttachment({ file, kind }, signal, token),
      );
    } else {
      setError("Choose a PDF, PNG, JPEG, WebP, text, or Markdown file.");
    }
  }

  return (
    <details
      className="proposal proposal-attachments"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file && !disabled && !reading && !full) addFile(file);
      }}
    >
      <summary>
        Add a file or link
        {value.length > 0 ? ` (${value.length})` : " (optional)"}
      </summary>
      <p>
        Share a public link, PDF, screenshot, text, or Markdown file. You can
        start with just an attachment.
      </p>
      <fieldset disabled={disabled || reading || full}>
        <label htmlFor={urlId}>Public page link</label>
        <div className="proposal-link">
          <input
            id={urlId}
            type="text"
            inputMode="url"
            placeholder="https://example.org/design"
            maxLength={2048}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (url.trim()) void addUrl();
            }}
          />
          <button
            type="button"
            className="button"
            disabled={!url.trim()}
            onClick={() => void addUrl()}
          >
            Add link
          </button>
        </div>
        <label htmlFor={fileId}>Upload a document or screenshot</label>
        <input
          id={fileId}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.text"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) addFile(file);
          }}
        />
      </fieldset>
      {value.length > 0 && (
        <ul className="proposal-attachment-list" aria-label="Attached context">
          {value.map(({ id, title, text }) => (
            <li key={id}>
              <span>
                {title}
                <small>{text.length.toLocaleString()} characters</small>
              </span>
              <button
                className="text-button"
                type="button"
                disabled={disabled || reading}
                aria-label={`Remove attachment ${title}`}
                onClick={() => onChange(value.filter((item) => item.id !== id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {full && <p>You can attach up to {limits.evidenceItems} items.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="field-note" role="status">
        {message}
      </p>
    </details>
  );
}
