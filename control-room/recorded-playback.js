/** Pace the recorded feedback without delaying the main application's report. */
export function makeRecordedPlayback() {
  let runId;
  let index = 0;
  let elapsed = 0;
  let snapshot;
  let displayedIndex;
  let displayed;

  return function advance(dt, review, reduced) {
    if (
      review?.source !== "recorded" ||
      !review.steps?.length ||
      review.phase === "stopped"
    )
      return review;
    if (runId !== review.id) {
      runId = review.id;
      index = 0;
      elapsed = 0;
    }
    elapsed += dt;
    while (index < review.steps.length - 1) {
      const step = review.steps[index];
      const staff = step.active.some((role) => role !== "slump");
      const hold = staff
        ? reduced
          ? 1.6
          : 17.5
        : step.active.includes("slump")
          ? reduced
            ? 1.5
            : 4.8
          : reduced
            ? 0.45
            : 1.2;
      if (elapsed < hold) break;
      elapsed -= hold;
      index++;
    }
    if (review !== snapshot || index !== displayedIndex) {
      const step = review.steps[index];
      const stations = { ...step.stations };
      if (review.phase === "ready") {
        for (const [role, station] of Object.entries(review.stations)) {
          if (station.state === "queued") {
            stations[role] = { ...station, state: "unrecorded" };
          }
        }
      }
      displayed = { ...review, ...step, stations };
      snapshot = review;
      displayedIndex = index;
    }
    return displayed;
  };
}
