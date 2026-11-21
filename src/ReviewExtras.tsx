import { useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import type { Finding, Report } from "../shared/review.ts";
import { verdictSchema } from "../shared/review.ts";
import { measurementChecker } from "../shared/settlement.ts";

export function downloadText(
  filename: string,
  text: string,
  type = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MeasurementArtifact({ finding }: { finding: Finding }) {
  if (finding.verdict !== "Unresolved" || !finding.missingInformation)
    return null;
  return (
    <details className="proposal settlement-artifact">
      <summary>Settle this claim</summary>
      <p>{finding.missingInformation}</p>
      <p>
        <strong>Next action</strong> {finding.nextStep}
      </p>
      <button
        type="button"
        className="button"
        onClick={() =>
          downloadText(
            "claim-check-plan.txt",
            [
              "# Claim check plan",
              "",
              finding.claim.text,
              "",
              "## Evidence to collect",
              "",
              finding.missingInformation,
              "",
              "## Next action",
              "",
              finding.nextStep,
              "",
              "Record the workload, environment, units, and acceptance criterion before collecting results.",
            ].join("\n"),
            "text/plain",
          )
        }
      >
        Download check plan
      </button>
      <p>
        If you can measure the claim, export a CSV with one numeric{" "}
        <code>value</code> per sample. Keep workload and units consistent. Set
        the threshold and sample minimum before collecting results.
      </p>
      <code>
        python3 check-measurement.py capture.csv --direction at-most --limit
        YOUR_LIMIT --minimum-samples YOUR_MINIMUM --statistic p95
      </code>
      <p>
        The command prints the observed statistic and exits with a passing or
        failing status. Choose mean, p95, min, or max to match the claim.
      </p>
      <button
        type="button"
        className="button"
        onClick={() => downloadText("check-measurement.py", measurementChecker)}
      >
        Download CSV checker
      </button>
    </details>
  );
}

const resultSchema = z.enum(["held", "failed", "inconclusive"]);
const outcomeSchema = z.object({
  proposal: z.string(),
  claim: z.string(),
  verdict: verdictSchema,
  result: z.union([resultSchema, z.literal("pending")]),
  note: z.string(),
  recordedAt: z.string(),
});
type Outcome = z.infer<typeof outcomeSchema>;
type Subject = Pick<Outcome, "proposal" | "claim" | "verdict">;

function readOutcomes(key: string): Outcome[] {
  try {
    const parsed = z
      .array(outcomeSchema)
      .max(100)
      .safeParse(JSON.parse(localStorage.getItem(key) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function sameClaim(left: Subject, right: Subject) {
  return (
    left.proposal === right.proposal &&
    left.claim === right.claim &&
    left.verdict === right.verdict
  );
}

export function OutcomeLog({
  accountId,
  proposal,
  report,
}: {
  accountId: string;
  proposal?: string;
  report?: Report;
}) {
  const storageKey = `tactile-outcomes-v1:${accountId}`;
  const [outcomes, setOutcomes] = useState(() => readOutcomes(storageKey));
  const [message, setMessage] = useState("");
  const reassurance = outcomes.filter(
    ({ verdict, result }) =>
      verdict === "No credible break found" &&
      (result === "held" || result === "failed"),
  );
  const subjects =
    report && proposal
      ? report.findings.map(({ claim, verdict }) => ({
          proposal,
          claim: claim.text,
          verdict,
        }))
      : outcomes.filter(({ result }) => result === "pending");

  function record(subject: Subject, result: Outcome["result"], note: string) {
    const outcome = {
      ...subject,
      result,
      note,
      recordedAt: new Date().toISOString(),
    };
    const next = [
      outcome,
      ...readOutcomes(storageKey).filter((row) => !sameClaim(row, subject)),
    ].slice(0, 100);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setOutcomes(next);
      setMessage(
        result === "pending"
          ? "Claim added to your workspace outcome log."
          : "Outcome saved on this device.",
      );
    } catch {
      setMessage("This browser could not save the outcome.");
    }
  }

  function save(event: FormEvent<HTMLFormElement>, subject: Subject) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const note = String(data.get("observation") ?? "").trim();
    const result = resultSchema.safeParse(data.get("outcome"));
    if (!note || !result.success) {
      setMessage("Select an outcome and record what you observed.");
      return;
    }
    record(subject, result.data, note);
  }

  if (!report && outcomes.length === 0) return null;
  return (
    <details className="proposal outcome-log">
      <summary>{report ? "Record rollout outcomes" : "Outcome log"}</summary>
      <p>
        Track a claim before rollout and return here to record the result. The
        latest 100 entries are saved on this device for this account.
      </p>
      {reassurance.length > 0 && (
        <p>
          {reassurance.filter(({ result }) => result === "held").length} of{" "}
          {reassurance.length} conclusive “No credible break found” claims held.
        </p>
      )}
      {subjects.map((subject, index) => {
        const saved = outcomes.find((row) => sameClaim(row, subject));
        return (
          <form
            className="evidence-entry"
            key={`${index}-${subject.claim}`}
            onSubmit={(event) => save(event, subject)}
          >
            <h4>{subject.claim}</h4>
            {saved?.result === "pending" && <p>Awaiting a rollout result.</p>}
            <label>
              Observed outcome
              <select
                name="outcome"
                required
                defaultValue={
                  saved?.result === "pending" ? "" : (saved?.result ?? "")
                }
              >
                <option value="">Choose an outcome</option>
                <option value="held">Claim held</option>
                <option value="failed">Claim failed</option>
                <option value="inconclusive">Inconclusive</option>
              </select>
            </label>
            <label>
              Observation
              <textarea
                name="observation"
                rows={2}
                maxLength={600}
                required
                defaultValue={saved?.note ?? ""}
              />
            </label>
            <div className="actions">
              <button type="submit" className="button">
                Save outcome
              </button>
              {!saved && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => record(subject, "pending", "")}
                >
                  Track after rollout
                </button>
              )}
            </div>
          </form>
        );
      })}
      {message && <p role="status">{message}</p>}
      {outcomes.length > 0 && (
        <button
          type="button"
          className="button"
          onClick={() =>
            downloadText(
              "tactile-outcomes.json",
              JSON.stringify(outcomes, null, 2),
              "application/json",
            )
          }
        >
          Export outcome log
        </button>
      )}
    </details>
  );
}
