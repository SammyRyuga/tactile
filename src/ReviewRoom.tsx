import { useId, useState } from "react";
import type { Claim, ProgressEvent, Report } from "../shared/review.ts";
import { reviewerIds, reviewers } from "../shared/reviewers.ts";
import type { Reviewer } from "../shared/reviewers.ts";
import "./review-room.css";

type Stage = ProgressEvent["stage"];
type Status = ProgressEvent["status"] | "waiting" | "unrecorded" | "memo-ready";
type Check = {
  stage: Stage;
  status: ProgressEvent["status"];
  detail?: string;
  claim?: string;
};

const stations = [
  {
    id: "assumptions",
    reviewer: "devils_advocate",
    label: "Assumptions",
    stages: ["Assumptions"],
  },
  {
    id: "feasibility",
    reviewer: "builder",
    label: "Feasibility",
    stages: ["Feasibility", "Engineering check", "Arithmetic"],
  },
  {
    id: "adoption",
    reviewer: "operator",
    label: "Adoption",
    stages: ["Adoption"],
  },
  {
    id: "evidence",
    reviewer: "researcher",
    label: "Evidence",
    stages: [
      "Evidence",
      "Source retrieval",
      "Project evidence",
      "Evidence critique",
      "Verification",
    ],
  },
  { id: "memo", reviewer: null, label: "Decision memo", stages: ["Synthesis"] },
] as const satisfies readonly {
  id: string;
  reviewer: Reviewer | null;
  label: string;
  stages: readonly Stage[];
}[];

const statusText: Record<Status, string> = {
  waiting: "Waiting",
  running: "In progress",
  done: "Complete",
  unavailable: "Incomplete",
  skipped: "Skipped",
  unrecorded: "Not recorded",
  "memo-ready": "Memo ready",
};

function stationStatus(checks: Check[]): Status {
  if (checks.some(({ status }) => status === "running")) return "running";
  if (checks.some(({ status }) => status === "unavailable"))
    return "unavailable";
  if (checks.some(({ status }) => status === "done")) return "done";
  return checks.length ? "skipped" : "waiting";
}

function ReviewRoom({
  checks,
  recommendation,
  panel,
  demo = false,
}: {
  checks: Check[];
  recommendation?: string;
  panel?: readonly Reviewer[];
  demo?: boolean;
}) {
  const [picked, setPicked] = useState<string>();
  const detailId = useId();
  const recorded = recommendation !== undefined;
  const positions = stations.map((station) => {
    const stages: readonly Stage[] = station.stages;
    const assigned = checks.filter(({ stage }) =>
      panel && stage === "Verification"
        ? station.id === "memo"
        : stages.includes(stage),
    );
    const status = stationStatus(assigned);
    const onPanel =
      !panel || !station.reviewer || panel.includes(station.reviewer);
    return {
      ...station,
      label: panel
        ? station.reviewer
          ? reviewers[station.reviewer].name
          : "Steelman"
        : station.label,
      assigned,
      onPanel,
      status:
        !onPanel && status === "waiting"
          ? ("skipped" as const)
          : recorded && status === "waiting"
            ? station.id === "memo"
              ? ("memo-ready" as const)
              : ("unrecorded" as const)
            : status,
    };
  });
  const selected =
    positions.find(({ id }) => id === picked) ??
    positions.find(({ status }) => status === "running") ??
    positions.find(({ status }) => status === "unavailable") ??
    positions.find(({ status }) => status === "done") ??
    positions.find(({ onPanel }) => onPanel) ??
    positions[0];
  const excerpt = selected.assigned.find(({ detail }) => detail);

  return (
    <div className="review-room">
      <div className="room-scene" role="group" aria-label="Review stations">
        <div className="room-platform" aria-hidden="true">
          <div className="room-deck">
            <div className="room-routing" />
          </div>
        </div>
        {positions.map(({ id, label, status }) => (
          <button
            className="room-station"
            type="button"
            key={id}
            data-station={id}
            data-status={status}
            aria-pressed={selected.id === id}
            aria-controls={detailId}
            aria-label={
              demo && status === "unrecorded"
                ? `${label} Not included in this example`
                : undefined
            }
            onClick={() => setPicked(id)}
          >
            <span className="room-instrument" aria-hidden="true">
              <span className="room-socket" />
              <span className="room-hardware">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="room-station-label">
              <span aria-hidden="true" />
              {label}
              <small>
                {demo && status === "unrecorded"
                  ? "Not included"
                  : statusText[status]}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="room-detail" id={detailId}>
        <p className="room-detail-mode">
          {demo
            ? recorded
              ? "Recorded checks"
              : "Recorded playback"
            : "Live checks"}
        </p>
        <h3>{selected.label}</h3>
        <p
          className="room-detail-status"
          aria-live={recorded ? "off" : "polite"}
        >
          {demo && selected.status === "unrecorded"
            ? "Not included in this example"
            : statusText[selected.status]}
        </p>
        {selected.assigned.length ? (
          <ul>
            {Array.from(
              new Set(selected.assigned.map(({ stage }) => stage)),
            ).map((stage) => (
              <li key={stage}>
                <span>{stage === "Synthesis" ? "Prepare memo" : stage}</span>
                <span>
                  {
                    statusText[
                      stationStatus(
                        selected.assigned.filter(
                          (check) => check.stage === stage,
                        ),
                      )
                    ]
                  }
                </span>
              </li>
            ))}
          </ul>
        ) : !recorded ? (
          <p className="room-note">
            {selected.onPanel
              ? "Check updates will appear here."
              : "This reviewer was skipped."}
          </p>
        ) : null}
        {selected.id === "memo" && recorded && !excerpt?.detail && (
          <div className="room-excerpt">
            <p>{recommendation}</p>
          </div>
        )}
        {excerpt?.detail && (
          <div className="room-excerpt">
            <small>Review update</small>
            {excerpt.claim && <strong>{excerpt.claim}</strong>}
            <p>{excerpt.detail}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveReviewRoom({
  claims,
  progress,
  updates,
  panel,
  demo,
}: {
  claims: Claim[];
  progress: Partial<Record<Stage, ProgressEvent["status"]>>;
  updates: Record<string, Partial<Record<Stage, ProgressEvent>>>;
  panel?: readonly Reviewer[];
  demo: boolean;
}) {
  const checks: Check[] = Object.entries(progress).map(([stage, status]) => ({
    stage: stage as Stage,
    status,
  }));
  for (const claim of claims) {
    for (const event of Object.values(updates[claim.id] ?? {})) {
      checks.push({ ...event, claim: claim.text });
    }
  }
  return <ReviewRoom checks={checks} panel={panel} demo={demo} />;
}

export function RecordedReviewRoom({ report }: { report: Report }) {
  const checks: Check[] = report.findings.flatMap(({ claim, audit }) =>
    (audit ?? []).map(({ stage, status, observation }) => ({
      stage,
      status:
        status === "complete"
          ? "done"
          : status === "failed"
            ? "unavailable"
            : "skipped",
      detail: observation,
      claim: claim.text,
    })),
  );
  if (!checks.length) return null;
  return (
    <details className="proposal room-disclosure">
      <summary>Review activity</summary>
      <ReviewRoom
        checks={checks}
        recommendation={report.recommendation}
        demo={report.mode === "demo"}
        panel={
          report.crossfireDecision
            ? (report.crossfireReviewers ?? reviewerIds)
            : undefined
        }
      />
    </details>
  );
}
