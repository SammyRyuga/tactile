export const stationNames = {
  devils_advocate: "Devil’s Advocate",
  builder: "Builder",
  operator: "Operator",
  researcher: "Researcher",
};

export function signalTrack(data) {
  return data.steelman_signal === "incoming"
    ? `incoming:${data.relay_role}`
    : data.steelman_signal;
}

/** Drive the authored deck signals from the demo clock or actual stage events. */
export function makeRoomProcess(model) {
  const clips = new Map();
  const relays = new Map();
  let workStart = 15;
  model.traverse(({ userData: data }) => {
    if (Number.isFinite(data.pod_work_start)) workStart = data.pod_work_start;
    const track = signalTrack(data);
    if (
      track &&
      Number.isFinite(data.signal_begin) &&
      Number.isFinite(data.signal_end)
    )
      clips.set(track, [data.signal_begin, data.signal_end]);
    for (const role of Object.keys(stationNames)) {
      const timing = data[`worker_relay_${role}_times`];
      if (data.worker_id && timing?.length === 2)
        relays.set(role, {
          worker: data.worker_id,
          pickup: timing[0],
          upload: timing[1],
        });
    }
  });

  const followUp = relays.get("researcher")?.pickup ?? 79;
  const synthesis = clips.get("processing")?.[0] ?? 101;
  const finalIntake = Math.max(
    0,
    ...[...relays.values()].map(({ upload }) => upload),
  );
  const result = clips.get("result")?.[0] ?? 109;
  let previousRun;
  const messages = new Map();
  let synthesisTime = 0;

  return function sample(dt, room, reduced) {
    const signals = new Map();
    const cargo = new Map();
    if (!room) return { signals, cargo };
    const { time, review, mode } = room.get("room");
    const live = mode === "live";
    const terminal = review?.phase === "ready" || review?.phase === "stopped";
    const run = live ? review.id : undefined;
    if (run !== previousRun) {
      messages.clear();
      synthesisTime = 0;
      previousRun = run;
    }

    for (const [role, { worker, pickup, upload }] of relays) {
      const track = `incoming:${role}`;
      const clip = clips.get(track);
      if (mode === "demo") {
        if (time >= pickup && time < upload) cargo.set(worker, role);
        if (clip && time >= clip[0] && time < clip[1])
          signals.set(track, { time, visible: true });
      } else if (live && !terminal) {
        const route = room.get(worker);
        if (!route) continue;
        const handoff = room.get(`handoff:${role}`);
        let message = messages.get(role);
        if (!message && handoff && handoff.time >= pickup)
          messages.set(role, (message = { carried: true }));
        if (!message) continue;
        if (message.carried && route.time < pickup) {
          messages.delete(role);
          continue;
        }
        if (message.carried && route.time < upload) {
          cargo.set(worker, role);
          continue;
        }
        message.carried = false;
        if (clip) {
          message.elapsed = (message.elapsed ?? 0) + dt;
          const sample = clip[0] + message.elapsed;
          if (sample < clip[1])
            signals.set(track, {
              time: reduced ? (clip[0] + clip[1]) / 2 : sample,
              visible: true,
            });
        }
        if (route.time < pickup && !handoff) messages.delete(role);
      }
    }

    const steelman =
      review?.steelman ??
      (review?.phase === "ready"
        ? "result"
        : review?.active?.includes("slump")
          ? "synthesizing"
          : "waiting");
    const processing = clips.get("processing");
    const showProcessing =
      mode === "demo"
        ? time >= synthesis && time < result
        : live &&
          !terminal &&
          (steelman === "verifying" || steelman === "synthesizing");
    if (showProcessing && processing) {
      const duration = processing[1] - processing[0];
      synthesisTime += dt;
      const sample =
        mode === "demo" ? time : processing[0] + (synthesisTime % duration);
      signals.set("processing", {
        time: reduced ? (processing[0] + processing[1]) / 2 : sample,
        visible: true,
      });
    } else synthesisTime = 0;

    const ready =
      mode === "demo" ? time >= result : live && review.phase === "ready";
    if (ready) {
      const clip = clips.get("result");
      const sample = live ? clip?.[1] : Math.min(time, clip?.[1] ?? time);
      signals.set("result", { time: sample, visible: true });
    }

    let label;
    if (mode === "manual-stop" || review?.phase === "stopped")
      label = "Review stopped";
    else if (ready) label = "Decision memo ready";
    else if (live) {
      if (steelman === "verifying") label = "Steelman · verifying";
      else if (steelman === "synthesizing") label = "Steelman · synthesizing";
      else if (steelman === "unavailable") label = "Steelman · unavailable";
      else if (
        review.stations?.researcher?.stages?.includes("Source retrieval") &&
        review.active.includes("researcher")
      )
        label = "Evidence follow-up";
      else
        label = review.active.length
          ? "Parallel specialist checks"
          : "Waiting for review activity";
    } else if (time < workStart) label = "Claim intake · stations waking";
    else if (time < followUp) label = "Parallel specialist checks";
    else if (time < finalIntake) label = "Evidence follow-up";
    else if (time < synthesis) label = "Verification and reconciliation";
    else label = "Steelman · synthesizing";

    const stations = Object.keys(stationNames).map((role) => {
      const phase = room.get(role)?.phase;
      const state = live
        ? (review.stations?.[role]?.state ??
          (review.active.includes(role) ? "working" : "inactive"))
        : phase === "working"
          ? "working"
          : phase === "waking"
            ? "queued"
            : phase === "returning" || ready
              ? "done"
              : "inactive";
      return [
        role,
        live && terminal && state === "queued" ? "inactive" : state,
      ];
    });
    return {
      mode: live
        ? review.source === "recorded"
          ? "Recorded review · visual replay"
          : "Live review · visual replay"
        : "Guided demo",
      label,
      signals,
      cargo,
      stations,
      ready,
    };
  };
}
