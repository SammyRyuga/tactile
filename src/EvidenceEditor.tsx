import { useId, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { limits } from "../shared/review.ts";
import type { ProjectEvidence } from "../shared/review.ts";
import { engineeringChecks } from "../shared/engineering.ts";
import type { EngineeringCheck } from "../shared/engineering.ts";

export type EvidenceDraft = ProjectEvidence;
export type CheckDraft = { kind: EngineeringCheck["kind"]; values: string[] };

export function EvidenceEditor({
  items,
  onChange,
}: {
  items: EvidenceDraft[];
  onChange: Dispatch<SetStateAction<EvidenceDraft[]>>;
}) {
  const prefix = useId();
  const [error, setError] = useState("");
  function update(id: string, changes: Partial<EvidenceDraft>) {
    onChange((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }
  return (
    <details className="proposal evidence-editor">
      <summary>
        Project evidence {items.length > 0 && `(${items.length})`}
      </summary>
      <p>
        Paste or attach something that helps check a claim, such as test results
        or a settings file. Add up to {limits.evidenceItems} text items,{" "}
        {limits.evidenceText.toLocaleString()} characters each.
      </p>
      <p>
        Tactile sends these files to the model to check your claims. Share only
        information you’re allowed to send.
      </p>
      {items.map((item, index) => (
        <div className="evidence-entry" key={item.id}>
          <label htmlFor={`${prefix}-title-${index}`}>
            Evidence title {index + 1}
          </label>
          <input
            type="text"
            id={`${prefix}-title-${index}`}
            value={item.title}
            maxLength={100}
            onChange={(event) => update(item.id, { title: event.target.value })}
          />
          <label htmlFor={`${prefix}-text-${index}`}>
            Evidence excerpt {index + 1}
          </label>
          <textarea
            id={`${prefix}-text-${index}`}
            rows={4}
            value={item.text}
            maxLength={limits.evidenceText}
            onChange={(event) => update(item.id, { text: event.target.value })}
          />
          <button
            className="text-button"
            type="button"
            onClick={() =>
              onChange((previous) =>
                previous.filter(({ id }) => id !== item.id),
              )
            }
          >
            Remove evidence {index + 1}
          </button>
        </div>
      ))}
      {items.length < limits.evidenceItems && (
        <div className="actions">
          <button
            className="button"
            type="button"
            onClick={() =>
              onChange((previous) =>
                [
                  ...previous,
                  { id: crypto.randomUUID(), title: "", text: "" },
                ].slice(0, limits.evidenceItems),
              )
            }
          >
            Add pasted evidence
          </button>
          <div>
            <label htmlFor={`${prefix}-file`}>Attach a text file</label>
            <input
              type="file"
              id={`${prefix}-file`}
              accept=".txt,.md,.csv,.json,.log,.yaml,.yml,.toml,.sql,.js,.ts,.py,text/*"
              onChange={async (event) => {
                const field = event.currentTarget;
                const file = field.files?.[0];
                field.value = "";
                if (!file) return;
                setError("");
                try {
                  if (file.size > limits.evidenceText * 4)
                    throw new Error(
                      "The file is too large. Paste the relevant excerpt.",
                    );
                  const text = (await file.text()).trim();
                  if (
                    text.length < 12 ||
                    text.length > limits.evidenceText ||
                    text.includes("\0") ||
                    text.includes("\uFFFD")
                  )
                    throw new Error(
                      "Use a readable UTF-8 text excerpt within the displayed limits.",
                    );
                  const item = {
                    id: crypto.randomUUID(),
                    title: file.name.slice(0, 100),
                    text,
                  };
                  onChange((previous) =>
                    [...previous, item].slice(0, limits.evidenceItems),
                  );
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "The file could not be read.",
                  );
                }
              }}
            />
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}

export function EngineeringEditor({
  draft,
  onChange,
}: {
  draft?: CheckDraft;
  onChange: (draft: CheckDraft | undefined) => void;
}) {
  const prefix = useId();
  return (
    <details className="proposal engineering-editor">
      <summary>
        {draft
          ? engineeringChecks[draft.kind].label
          : "Add an engineering check"}
      </summary>
      <label htmlFor={`${prefix}-kind`}>Check</label>
      <select
        id={`${prefix}-kind`}
        value={draft?.kind ?? ""}
        onChange={(event) => {
          const kind = event.target.value as EngineeringCheck["kind"] | "";
          onChange(
            kind
              ? { kind, values: engineeringChecks[kind].fields.map(() => "") }
              : undefined,
          );
        }}
      >
        <option value="">None</option>
        {Object.entries(engineeringChecks).map(([kind, definition]) => (
          <option value={kind} key={kind}>
            {definition.label}
          </option>
        ))}
      </select>
      {draft && (
        <div className="engineering-fields">
          {engineeringChecks[draft.kind].fields.map(
            ({ label, min, max, integer }, index) => (
              <label key={label}>
                {label}
                <input
                  type="number"
                  value={draft.values[index] ?? ""}
                  min={min}
                  max={max}
                  step={integer ? 1 : "any"}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      values: draft.values.map((value, current) =>
                        current === index ? event.target.value : value,
                      ),
                    })
                  }
                />
              </label>
            ),
          )}
        </div>
      )}
    </details>
  );
}
