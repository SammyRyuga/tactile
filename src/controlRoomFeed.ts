import type { ProgressEvent, ReviewEvent } from "../shared/review.ts";
import { reviewerIds } from "../shared/reviewers.ts";
import type { Reviewer } from "../shared/reviewers.ts";

export const controlRoomFeedKey = "tactile-control-room-activity";
export const controlRoomSessionKey = "tactile-operator-room-session";

type RoomActor = Reviewer | "slump";
type Stage = ProgressEvent["stage"];
type Status = ProgressEvent["status"];
type Phase = "start" | "running" | "ready" | "stopped";
type Source = "live" | "recorded";
type Station = {
  state: "inactive" | "queued" | "working" | "done" | "unavailable" | "skipped";
  stages: Stage[];
};

export type ControlRoomActivity = {
  id: string;
  phase: Phase;
  source: Source;
  at: number;
  panel: readonly Reviewer[];
  active: RoomActor[];
  settled: RoomActor[];
  stations: Record<Reviewer, Station>;
  steelman:
    | "waiting"
    | "verifying"
    | "synthesizing"
    | "result"
    | "unavailable"
    | "stopped";
};

type RecordedStep = Pick<
  ControlRoomActivity,
  "phase" | "active" | "settled" | "stations" | "steelman"
>;

const stationByStage: Record<Stage, RoomActor> = {
  Assumptions: "devils_advocate",
  Feasibility: "builder",
  "Engineering check": "builder",
  Arithmetic: "builder",
  Adoption: "operator",
  Evidence: "researcher",
  "Source retrieval": "researcher",
  "Project evidence": "researcher",
  "Evidence critique": "researcher",
  Verification: "slump",
  Synthesis: "slump",
};

const statusPriority: Record<Status, number> = {
  skipped: 0,
  done: 1,
  unavailable: 2,
  running: 3,
};

function stationActivity(
  selected: boolean,
  progress: ReadonlyMap<Stage, Status>,
): Station {
  if (!selected) return { state: "inactive", stages: [] };
  const stageStatuses = [...progress];
  const active = stageStatuses.filter(([, status]) => status === "running");
  if (active.length)
    return { state: "working", stages: active.map(([stage]) => stage) };
  const state = stageStatuses.some(([, status]) => status === "unavailable")
    ? "unavailable"
    : stageStatuses.some(([, status]) => status === "done")
      ? "done"
      : stageStatuses.length
        ? "skipped"
        : "queued";
  return { state, stages: stageStatuses.map(([stage]) => stage) };
}

function steelmanActivity(
  phase: Phase,
  progress: ReadonlyMap<Stage, Status>,
): ControlRoomActivity["steelman"] {
  if (phase === "ready") return "result";
  if (phase === "stopped") return "stopped";
  const synthesis = progress.get("Synthesis");
  const verification = progress.get("Verification");
  if (synthesis === "running") return "synthesizing";
  if (verification === "running") return "verifying";
  return (synthesis ?? verification) === "unavailable"
    ? "unavailable"
    : "waiting";
}

export function startControlRoomFeed(
  panel: readonly Reviewer[],
  source: Source = "live",
) {
  if (!["127.0.0.1", "localhost"].includes(location.hostname)) return;
  const id = crypto.randomUUID();
  const tasks = new Map<string, Pick<ProgressEvent, "stage" | "status">>();
  const steps: RecordedStep[] = [];

  function publish(phase: Phase) {
    try {
      const actors = [...reviewerIds, "slump"] as const;
      const progress = new Map(
        actors.map((actor) => [actor, new Map<Stage, Status>()]),
      );
      const terminal = phase === "ready" || phase === "stopped";
      for (const { stage, status } of tasks.values()) {
        if (terminal && status === "running") continue;
        const station = progress.get(stationByStage[stage])!;
        const previousStatus = station.get(stage);
        if (
          !previousStatus ||
          statusPriority[status] > statusPriority[previousStatus]
        )
          station.set(stage, status);
      }

      const stations = Object.fromEntries(
        reviewerIds.map((role) => [
          role,
          stationActivity(panel.includes(role), progress.get(role)!),
        ]),
      ) as ControlRoomActivity["stations"];
      const active: RoomActor[] = [];
      const settled: RoomActor[] = [];
      for (const [actor, statuses] of progress) {
        if ([...statuses.values()].includes("running")) active.push(actor);
        else if (statuses.size) settled.push(actor);
      }
      const snapshot: ControlRoomActivity = {
        id,
        phase,
        source,
        at: Date.now(),
        panel,
        active,
        settled,
        stations,
        steelman: steelmanActivity(phase, progress.get("slump")!),
      };
      if (source === "recorded") {
        const step = {
          phase,
          active,
          settled,
          stations,
          steelman: snapshot.steelman,
        };
        if (JSON.stringify(step) !== JSON.stringify(steps.at(-1)))
          steps.push(step);
      }
      try {
        const previous = JSON.parse(
          sessionStorage.getItem(controlRoomSessionKey) ?? "null",
        );
        if (phase === "start" || previous?.id === id)
          sessionStorage.setItem(
            controlRoomSessionKey,
            JSON.stringify({ ...snapshot, steps }),
          );
      } catch {
        // The standalone room can still read the latest shared snapshot.
      }
      if (source === "recorded") return;
      const previous = JSON.parse(
        localStorage.getItem(controlRoomFeedKey) ?? "null",
      );
      if (phase === "start" || previous?.id === id)
        localStorage.setItem(controlRoomFeedKey, JSON.stringify(snapshot));
    } catch {
      // Storage access is optional and must never interrupt a review.
    }
  }

  publish("start");
  let finished = false;
  return {
    id,
    event(event: ReviewEvent) {
      if (finished) return;
      if (event.type === "report") {
        finished = true;
        publish("ready");
      } else if (event.type === "progress") {
        const { stage, status } = event;
        const role = stationByStage[stage];
        if (role !== "slump" && !panel.includes(role)) return;
        // Keep distinct claims in flight without retaining their IDs in storage.
        const key = JSON.stringify([stage, event.claimId ?? null]);
        tasks.set(key, { stage, status });
        publish("running");
      }
    },
    finish() {
      if (!finished) {
        finished = true;
        publish("stopped");
      }
    },
  };
}
