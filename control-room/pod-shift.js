/** Sample the lifecycle poses authored and exported from Blender. */
export function makePodShift(model, roles) {
  const pods = new Map();
  const workers = new Map();
  const handoffs = new Map();
  let projector;
  model.traverse((object) => {
    const data = object.userData;
    if (roles.includes(data.reviewer_id) && Number.isFinite(data.pod_sleep)) {
      pods.set(data.reviewer_id, data);
    }
    if (data.worker_id && data.worker_park_times?.length) {
      workers.set(data.worker_id, {
        stops: data.worker_park_times,
        wake: data.worker_wake_times,
        alternatives: data.worker_alt_park_times ?? [],
      });
      for (const role of roles) {
        const window = data[`worker_handoff_${role}_times`];
        if (window?.length === 2)
          handoffs.set(role, { id: data.worker_id, window });
      }
    }
    if (data.steelman_shutdown_seconds > 0) projector = data;
  });
  if (pods.size !== roles.length) return;
  const needsWorkerWake = [...workers.values()].some(({ wake }) => wake);

  const { pod_work_start: first, pod_work_end: last } = pods
    .values()
    .next().value;
  const states = new Map();
  const parking = new Map();
  const departures = new Map();
  let demoTime = 0;
  let workTime = 0;
  let workerWakeTime = 0;
  let runId;
  let tempo = 1;
  let projectorPower = 1;
  let projectorClock = 0;
  let manualReview;
  let demoFrames;

  function sampleHandoffs(frames, activeRoles, terminal, reduced) {
    for (const [role, meeting] of handoffs) {
      const worker = frames.get(meeting.id);
      if (!worker) continue;
      const [start, end] = pods.get(role).pod_handoff;
      const [workerStart, workerEnd] = meeting.window;
      const time = worker.time;
      if (worker.phase === "waking") {
        // An alternate cabinet departure can pass a handoff waypoint.
        if (time >= workerStart && time < workerEnd) worker.time = workerStart;
        continue;
      }
      if (time < start || time >= end) {
        meeting.allowed = undefined;
        meeting.time = undefined;
        continue;
      }
      meeting.time = time;
      // Decide once at the approach. A stage update during a reach should
      // neither start an exchange late nor pull the grippers apart.
      if (reduced) meeting.allowed = false;
      meeting.allowed ??=
        !terminal &&
        activeRoles.includes(role) &&
        states.get(role).phase === "working";
      if (!meeting.allowed && time >= workerStart && time < workerEnd)
        worker.time = workerStart;
    }
  }

  function rememberDocks() {
    departures.clear();
    for (const [id, stop] of parking) {
      if (
        stop.time === stop.end &&
        workers.get(id).alternatives.includes(stop.end)
      )
        departures.set(id, stop.end);
    }
    parking.clear();
  }

  function wakeWorker(id, elapsed) {
    const { wake } = workers.get(id);
    const dock = departures.get(id);
    const [begin, ready] = dock === undefined ? wake : [0, 0.5];
    // From an alternate dock, finish the existing patrol back to the same lane
    // entry that the regular wake sequence reaches.
    return {
      phase: elapsed > begin ? "waking" : "waiting",
      time:
        dock === undefined
          ? elapsed
          : dock +
            (last - dock) * Math.max(0, (elapsed - ready) / (first - ready)),
      power: Math.min(1, Math.max(0, (elapsed - begin) / (ready - begin))),
    };
  }

  function updateProjector(frames, dt, shutdown, reduced) {
    if (!projector) return;
    if (reduced) projectorPower = shutdown ? 0 : 1;
    else {
      const step = dt / projector.steelman_shutdown_seconds;
      projectorPower = shutdown
        ? Math.max(0, projectorPower - step)
        : Math.min(1, projectorPower + step);
    }
    if (projectorPower > 0 && !reduced)
      projectorClock =
        (projectorClock + dt) % projector.steelman_packet_cycle_seconds;
    frames.set("projection", {
      phase:
        projectorPower === 0 ? "off" : shutdown ? "powering down" : "working",
      time: first + projectorClock,
      power: projectorPower,
    });
  }

  return function advance(dt, review, reduced, command) {
    if (command === "start") {
      manualReview = null;
      runId = undefined;
      demoTime = 0;
      rememberDocks();
    } else if (command === "stop") {
      let demoPose;
      if (runId === undefined && demoFrames) {
        runId = "manual-room";
        workerWakeTime = Math.min(first, demoTime);
        demoPose = demoFrames.get("support").time;
        for (const role of roles) {
          const state = demoFrames.get(role);
          const elapsed =
            state.phase === "returning" ? state.time - last : state.time;
          states.set(role, { ...state, elapsed, quiet: 0 });
          const meeting = handoffs.get(role);
          if (meeting) {
            const [start, end] = pods.get(role).pod_handoff;
            meeting.allowed =
              state.phase === "working" &&
              state.time >= start &&
              state.time < end
                ? true
                : undefined;
          }
        }
        for (const [id, { stops, wake }] of workers) {
          if (wake && workerWakeTime < first) continue;
          const { time } = demoFrames.get(id);
          const end = reduced
            ? stops.at(-1)
            : stops.find((stop) => stop >= time);
          parking.set(id, { time, end });
        }
      }
      manualReview = { id: runId, phase: "stopped", active: [], demoPose };
    }
    if (manualReview !== undefined) review = manualReview;
    const frames = new Map();
    if (!review) {
      if (runId !== undefined) demoTime = 0;
      runId = undefined;
      demoTime = reduced ? first : demoTime + dt;
      for (const [role, pod] of pods) {
        const done = pod.pod_demo_done;
        frames.set(role, {
          phase:
            demoTime < first
              ? "waking"
              : demoTime < done
                ? "working"
                : demoTime - done < pod.pod_sleep - last
                  ? "returning"
                  : "sleeping",
          time:
            demoTime < done
              ? demoTime
              : Math.min(pod.pod_sleep, last + demoTime - done),
        });
      }
      const shared = Math.min(last, Math.max(first, demoTime));
      for (const [id, { stops, wake }] of workers) {
        if (wake && demoTime < first) {
          frames.set(id, wakeWorker(id, demoTime));
          continue;
        }
        const end = stops.at(-1);
        frames.set(id, {
          phase:
            demoTime < first
              ? "waiting"
              : demoTime < last
                ? "working"
                : demoTime < end
                  ? "parking"
                  : "sleeping",
          time: Math.min(end, Math.max(first, demoTime)),
          power: Math.min(1, Math.max(0, (end - demoTime) * 2)),
        });
      }
      if (demoTime < first) sampleHandoffs(frames, [], false, reduced);
      frames.set("support", {
        phase: demoTime >= first && demoTime < last ? "working" : "waiting",
        time: shared,
      });
      frames.set("slump", {
        phase: demoTime >= first && demoTime < last ? "working" : "waiting",
        time: shared,
      });
      updateProjector(
        frames,
        dt,
        roles.every((role) => frames.get(role).phase === "sleeping"),
        reduced,
      );
      frames.set("room", { mode: "demo", time: demoTime });
      demoFrames = frames;
      return frames;
    }

    const terminal = review.phase === "ready" || review.phase === "stopped";
    if (review.id !== runId) {
      runId = review.id;
      workTime = 0;
      workerWakeTime = 0;
      rememberDocks();
      for (const meeting of handoffs.values()) {
        meeting.allowed = undefined;
        meeting.time = undefined;
      }
      let hash = 0;
      for (const char of runId)
        hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
      tempo = 0.94 + (hash % 100) * 0.0012;
      for (const [role, pod] of pods) {
        states.set(role, {
          phase:
            review.active.includes(role) && !terminal ? "waking" : "sleeping",
          elapsed: 0,
          quiet: 0,
          time: pod.pod_sleep,
        });
      }
    }
    const active = review.active.length > 0 && !terminal;
    const clearing =
      !active &&
      !terminal &&
      [...handoffs.values()].some(({ allowed }) => allowed);
    if ((active || clearing) && !reduced) {
      const waking = needsWorkerWake ? Math.min(dt, first - workerWakeTime) : 0;
      workerWakeTime += waking;
      workTime += (dt - waking) * tempo;
    } else if (active && reduced) {
      workerWakeTime = first;
    }
    const shared = review.demoPose ?? first + (workTime % (last - first));
    for (const [id, { stops, wake }] of workers) {
      if (!terminal) {
        if (wake && workerWakeTime < first) {
          frames.set(id, wakeWorker(id, workerWakeTime));
          continue;
        }
        frames.set(id, {
          phase: active || clearing ? "working" : "waiting",
          time: shared,
          power: 1,
        });
        continue;
      }
      if (wake && workerWakeTime < first) {
        if (!parking.has(id)) {
          const end = departures.get(id) ?? 0;
          parking.set(id, { wakeTime: workerWakeTime, end });
        }
        const stop = parking.get(id);
        const hold = departures.has(id) ? 0 : wake[0];
        stop.wakeTime = reduced ? 0 : Math.max(0, stop.wakeTime - dt);
        if (stop.wakeTime <= hold) {
          stop.time = stop.end;
          frames.set(id, { phase: "sleeping", time: stop.end, power: 0 });
        } else {
          frames.set(id, {
            ...wakeWorker(id, stop.wakeTime),
            phase: "parking",
          });
        }
        continue;
      }
      if (!parking.has(id)) {
        const end = reduced
          ? stops.at(-1)
          : stops.find((stop) => stop >= shared);
        parking.set(id, { time: shared, end });
      }
      const stop = parking.get(id);
      stop.time = reduced ? stop.end : Math.min(stop.end, stop.time + dt);
      frames.set(id, {
        phase: stop.time < stop.end ? "parking" : "sleeping",
        time: stop.time,
        power: Math.min(1, (stop.end - stop.time) * 2),
      });
    }
    sampleHandoffs(frames, review.active, terminal, reduced);
    for (const [role, meeting] of handoffs) {
      if (meeting.allowed)
        frames.set(`handoff:${role}`, { time: meeting.time });
    }
    frames.set("support", {
      phase: active ? "working" : "waiting",
      time: shared,
    });
    frames.set("slump", {
      phase:
        review.active.includes("slump") && !terminal ? "working" : "waiting",
      time: shared,
    });

    for (const [role, pod] of pods) {
      const state = states.get(role);
      const working = !terminal && review.active.includes(role);
      const complete = review.settled?.includes(role) ?? false;
      const meeting = handoffs.get(role);
      state.quiet = complete && !working ? state.quiet + dt : 0;
      if (state.phase === "sleeping" && working) {
        state.phase = "waking";
        state.elapsed = 0;
      }
      if (state.phase === "waking" && (terminal || (complete && !working))) {
        state.phase = "returning";
        state.reverseWake = true;
      } else if (state.phase === "waking") {
        state.elapsed = reduced ? first : state.elapsed + dt;
        state.time = Math.min(state.elapsed, first);
        if (state.elapsed >= first) state.phase = "working";
      } else if (state.phase === "working") {
        const [handoffStart, handoffEnd] = pod.pod_handoff ?? [];
        if (meeting?.allowed) {
          state.time = meeting.time;
        } else if (terminal || state.quiet >= 2.5) {
          if (
            !meeting &&
            !reduced &&
            state.time >= handoffStart &&
            state.time < handoffEnd
          ) {
            state.time = Math.min(handoffEnd, state.time + dt);
          } else {
            state.phase = "returning";
            state.elapsed = 0;
          }
        } else if (working) {
          state.time =
            meeting && shared >= handoffStart && shared < handoffEnd
              ? handoffStart
              : shared;
        }
      } else if (state.phase === "returning" && state.reverseWake) {
        state.elapsed = reduced ? 0 : Math.max(0, state.elapsed - dt);
        state.time = state.elapsed;
        if (state.time === 0) {
          state.phase = "sleeping";
          state.reverseWake = false;
        }
      } else if (state.phase === "returning") {
        state.elapsed = reduced ? pod.pod_sleep - last : state.elapsed + dt;
        state.time = Math.min(pod.pod_sleep, last + state.elapsed);
        if (state.time >= pod.pod_sleep) state.phase = "sleeping";
      }
      // A later check can request a new wake after the current docking ends.
      frames.set(role, state);
    }
    updateProjector(
      frames,
      dt,
      terminal && roles.every((role) => frames.get(role).phase === "sleeping"),
      reduced,
    );
    frames.set("room", {
      mode: manualReview ? "manual-stop" : "live",
      time: shared,
      review,
    });
    return frames;
  };
}
