import { useId, useState } from "react";
import type { Claim, ProgressEvent, Report } from "../shared/review.ts";
import "./review-room.css";

type Stage = ProgressEvent["stage"];
type Status = ProgressEvent["status"] | "waiting" | "unrecorded";
type Check = { stage: Stage; status: Status; detail?: string; claim?: string };

const stations = [
  { id: "assumptions", label: "Assumptions", stages: ["Assumptions"] },
  {
    id: "feasibility",
    label: "Feasibility",
    stages: ["Feasibility", "Engineering check", "Arithmetic"],
  },
  { id: "adoption", label: "Adoption", stages: ["Adoption"] },
  {
    id: "evidence",
    label: "Evidence",
    stages: [
      "Evidence",
      "Source retrieval",
      "Project evidence",
      "Evidence critique",
      "Verification",
    ],
  },
  { id: "memo", label: "Decision memo", stages: ["Synthesis"] },
] as const satisfies readonly {
  id: string;
  label: string;
  stages: readonly Stage[];
}[];

const statusText: Record<Status, string> = {
  waiting: "Waiting",
  running: "In progress",
  done: "Complete",
  unavailable: "Incomplete",
  skipped: "Skipped",
  unrecorded: "No record",
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
}: {
  checks: Check[];
  recommendation?: string;
}) {
  const [picked, setPicked] = useState<string>();
  const detailId = useId();
  const recorded = recommendation !== undefined;
  const positions = stations.map((station) => {
    const assigned = checks.filter(({ stage }) =>
      (station.stages as readonly Stage[]).includes(stage),
    );
    const status = stationStatus(assigned);
    return {
      ...station,
      assigned,
      status:
        recorded && status === "waiting"
          ? station.id === "memo"
            ? ("done" as const)
            : ("unrecorded" as const)
          : status,
    };
  });
  const selected =
    positions.find(({ id }) => id === picked) ??
    positions.find(({ status }) => status === "running") ??
    positions.find(({ status }) => status === "unavailable") ??
    positions.find(({ status }) => status === "done") ??
    positions[0];
  const excerpt = selected.assigned.find(({ detail }) => detail);

  return (
    <div className="review-room">
      <div className="room-scene" role="group" aria-label="Review stations">
        <div className="room-platform" aria-hidden="true">
          <div className="room-deck" />
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
            onClick={() => setPicked(id)}
          >
            <span className="room-machine" aria-hidden="true">
              <span className="room-machine-screen">
                <i />
                <i />
                <i />
              </span>
            </span>
            <span className="room-station-label">
              <span aria-hidden="true" />
              {label}
              <small>{statusText[status]}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="room-detail" id={detailId}>
        <p className="room-detail-mode">
          {recorded ? "Recorded checks" : "Review room"}
        </p>
        <h3>{selected.label}</h3>
        <p
          className="room-detail-status"
          aria-live={recorded ? "off" : "polite"}
        >
          {statusText[selected.status]}
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
        ) : selected.id !== "memo" || !recorded ? (
          <p className="room-note">
            {recorded
              ? "This station has no recorded checks."
              : "Check updates will appear here."}
          </p>
        ) : null}
        {selected.id === "memo" && recorded && !excerpt?.detail && (
          <div className="room-excerpt">
            <p>{recommendation}</p>
          </div>
        )}
        {excerpt?.detail && (
          <div className="room-excerpt">
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
}: {
  claims: Claim[];
  progress: Partial<Record<Stage, ProgressEvent["status"]>>;
  updates: Record<string, Partial<Record<Stage, ProgressEvent>>>;
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
  return <ReviewRoom checks={checks} />;
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
      <summary>See the review room</summary>
      <ReviewRoom checks={checks} recommendation={report.recommendation} />
    </details>
  );
}
