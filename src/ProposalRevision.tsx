import { useEffect, useId, useRef, useState } from "react";
import { limits, proposalSchema } from "../shared/review.ts";
import type { Report } from "../shared/review.ts";
import { reviseProposal } from "./api.ts";

export function ProposalRevision({
  proposal,
  report,
  token,
  onUse,
}: {
  proposal: string;
  report: Report;
  token?: string;
  onUse: (proposal: string) => void;
}) {
  const guidanceId = useId();
  const draftId = useId();
  const changes = report.findings.flatMap(({ claim, repair, verdict }) =>
    repair?.minimalFix && (verdict === "Broken" || verdict === "Weakened")
      ? [
          {
            id: claim.id,
            claim: claim.text,
            salvage: repair.minimalFix.slice(0, 1200),
          },
        ]
      : [],
  );
  const [included, setIncluded] = useState(() => changes.map(({ id }) => id));
  const [guidance, setGuidance] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function generate() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setWorking(true);
    setError("");
    try {
      const revision = await reviseProposal(
        {
          proposal,
          guidance,
          changes: changes.filter(({ id }) => included.includes(id)),
        },
        controller.signal,
        token,
        report.provider && report.model
          ? { id: report.provider, model: report.model }
          : undefined,
      );
      if (!controller.signal.aborted) setDraft(revision);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Could not revise the plan.",
        );
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setWorking(false);
    }
  }

  if (!changes.length) return null;
  const validated = proposalSchema.safeParse(draft);
  return (
    <details className="proposal proposal-revision">
      <summary>Revise your plan</summary>
      <p>Choose which reviewer fixes should go into the next draft.</p>
      <fieldset className="reviewer-picker" disabled={working}>
        <legend>Suggested changes</legend>
        {changes.map(({ id, claim, salvage }) => (
          <label key={id} className="check-label revision-choice">
            <input
              type="checkbox"
              checked={included.includes(id)}
              onChange={(event) =>
                setIncluded((current) =>
                  event.target.checked
                    ? [...current, id]
                    : current.filter((entry) => entry !== id),
                )
              }
            />
            <span>
              <strong>{claim}</strong>
              <small>{salvage}</small>
            </span>
          </label>
        ))}
        <label htmlFor={guidanceId}>Revision guidance (optional)</label>
        <textarea
          id={guidanceId}
          rows={2}
          value={guidance}
          maxLength={400}
          onChange={(event) => setGuidance(event.target.value)}
        />
        <button
          className="button"
          type="button"
          disabled={!included.length}
          onClick={() => void generate()}
        >
          {working ? "Revising plan…" : "Create revised draft"}
        </button>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <div className="revision-draft">
          <label htmlFor={draftId}>Revised draft</label>
          <textarea
            id={draftId}
            rows={7}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          {!validated.success && (
            <p className="field-note">
              Keep the draft between 20 and {limits.proposal.toLocaleString()}{" "}
              characters.
            </p>
          )}
          <button
            className="button primary"
            type="button"
            disabled={!validated.success || working}
            onClick={() => validated.success && onUse(validated.data)}
          >
            Use this draft
          </button>
        </div>
      )}
    </details>
  );
}
