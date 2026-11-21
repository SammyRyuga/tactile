import type { Dispatch, SetStateAction } from "react";
import { EvidenceEditor, EngineeringEditor } from "./EvidenceEditor.tsx";
import type { CheckDraft, EvidenceDraft } from "./EvidenceEditor.tsx";
import { claimSchema } from "../shared/review.ts";
import type { Claim, DecisionContext } from "../shared/review.ts";
import { reviewerIds, reviewers } from "../shared/reviewers.ts";
import type { Reviewer } from "../shared/reviewers.ts";

type AssumptionSettings = Pick<Claim, "id" | "risk"> & {
  checkDraft?: CheckDraft;
};

export function ReviewSettings({
  proposal,
  claims,
  onClaimChange,
  live,
}: {
  proposal: string;
  claims: AssumptionSettings[];
  onClaimChange: (
    id: string,
    change: Partial<Omit<AssumptionSettings, "id">>,
  ) => void;
  live?: {
    decision: DecisionContext;
    onDecisionChange: (decision: DecisionContext) => void;
    panel: readonly Reviewer[];
    onPanelChange: (panel: Reviewer[]) => void;
    evidence: EvidenceDraft[];
    onEvidenceChange: Dispatch<SetStateAction<EvidenceDraft[]>>;
  };
}) {
  return (
    <div className="review-setup review-disclosures">
      <details className="proposal review-settings">
        <summary>Advanced settings</summary>
        <details className="proposal claim-proposal">
          <summary>Read your plan</summary>
          <p>{proposal}</p>
        </details>
        {live && (
          <>
            <fieldset className="reviewer-picker decision-fields">
              <legend>Decision context</legend>
              <label>
                Can you reverse this decision?
                <select
                  value={live.decision.reversibility ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    live.onDecisionChange({
                      ...live.decision,
                      reversibility:
                        value === "one_way" || value === "two_way"
                          ? value
                          : null,
                    });
                  }}
                >
                  <option value="">Not sure</option>
                  <option value="two_way">Yes, we can reverse it</option>
                  <option value="one_way">No, it is hard to reverse</option>
                </select>
              </label>
              <label>
                Decision deadline (optional)
                <input
                  type="text"
                  value={live.decision.deadline}
                  maxLength={120}
                  placeholder="Before the next rollout"
                  onChange={(event) =>
                    live.onDecisionChange({
                      ...live.decision,
                      deadline: event.target.value,
                    })
                  }
                />
              </label>
            </fieldset>
            <fieldset className="reviewer-picker">
              <legend>How we'll check your plan</legend>
              <div className="reviewer-options">
                {reviewerIds.map((id) => (
                  <label className="check-label reviewer-option" key={id}>
                    <input
                      type="checkbox"
                      checked={live.panel.includes(id)}
                      disabled={
                        live.panel.length === 1 && live.panel.includes(id)
                      }
                      onChange={(event) =>
                        live.onPanelChange(
                          event.target.checked
                            ? [...live.panel, id]
                            : live.panel.filter((reviewer) => reviewer !== id),
                        )
                      }
                    />
                    <span>
                      <strong>{reviewers[id].name}</strong>
                      <small>{reviewers[id].role}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <EvidenceEditor
              items={live.evidence}
              onChange={live.onEvidenceChange}
            />
          </>
        )}
        {claims.map((claim, index) => (
          <fieldset
            className="reviewer-picker assumption-settings"
            key={claim.id}
          >
            <legend>Assumption {index + 1}</legend>
            <label>
              Main risk
              <select
                aria-label={`Main risk for assumption ${index + 1}`}
                value={claim.risk ?? "logic"}
                onChange={(event) => {
                  const result = claimSchema.shape.risk.safeParse(
                    event.target.value,
                  );
                  if (result.success)
                    onClaimChange(claim.id, { risk: result.data });
                }}
              >
                <option value="logic">Does the plan make sense?</option>
                <option value="technical">Will the change work?</option>
                <option value="adoption">Rollout and operations</option>
                <option value="evidence">Is there enough evidence?</option>
              </select>
            </label>
            {live && (
              <EngineeringEditor
                draft={claim.checkDraft}
                onChange={(checkDraft) =>
                  onClaimChange(claim.id, { checkDraft })
                }
              />
            )}
          </fieldset>
        ))}
      </details>
    </div>
  );
}
