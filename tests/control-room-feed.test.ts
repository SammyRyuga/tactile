import assert from "node:assert/strict";
import test from "node:test";
import type { ReviewEvent } from "../shared/review.ts";
import type { Reviewer } from "../shared/reviewers.ts";
import { startControlRoomFeed } from "../src/controlRoomFeed.ts";
import type { ControlRoomActivity } from "../src/controlRoomFeed.ts";

function room(panel: Reviewer[], source: "live" | "recorded" = "live") {
  let snapshot: ControlRoomActivity | undefined;
  const feed = startControlRoomFeed(panel, source, (next) => {
    snapshot = next;
  });
  return {
    ...feed,
    read() {
      assert.ok(snapshot);
      return snapshot;
    },
  };
}

const report: ReviewEvent = {
  type: "report",
  report: {
    mode: "live",
    findings: [],
    sources: [],
    recommendation: "private recommendation",
  },
};

test("parallel stage updates keep the selected stations active without private data", () => {
  const feed = room(["builder", "researcher", "operator"]);
  assert.equal(feed.read().stations.builder.state, "queued");
  assert.equal(feed.read().stations.devils_advocate.state, "inactive");
  for (const claimId of ["private-a", "private-b"])
    feed.event({
      type: "progress",
      stage: "Feasibility",
      status: "running",
      claimId,
      detail: "private details",
    });
  feed.event({ type: "progress", stage: "Evidence", status: "running" });
  feed.event({
    type: "progress",
    stage: "Feasibility",
    status: "done",
    claimId: "private-a",
  });
  feed.event({ type: "progress", stage: "Adoption", status: "skipped" });
  feed.event({ type: "progress", stage: "Assumptions", status: "running" });
  assert.deepEqual(feed.read().active, ["researcher", "builder"]);
  assert.equal(feed.read().stations.operator.state, "skipped");
  assert.doesNotMatch(JSON.stringify(feed.read()), /private/);
  feed.event({
    type: "progress",
    stage: "Feasibility",
    status: "unavailable",
    claimId: "private-b",
  });
  assert.equal(feed.read().stations.builder.state, "unavailable");
  assert.ok(feed.read().settled.includes("builder"));
});

test("recorded steps are isolated per run, and only a report marks Steelman ready", () => {
  const recorded = room(["builder"], "recorded");
  recorded.event({ type: "progress", stage: "Feasibility", status: "running" });
  recorded.event({ type: "progress", stage: "Feasibility", status: "done" });
  recorded.event({
    type: "progress",
    stage: "Verification",
    status: "running",
  });
  assert.equal(recorded.read().steelman, "verifying");
  recorded.event({ type: "progress", stage: "Verification", status: "done" });
  recorded.event({ type: "progress", stage: "Synthesis", status: "running" });
  assert.equal(recorded.read().steelman, "synthesizing");
  recorded.event({ type: "progress", stage: "Synthesis", status: "done" });
  assert.equal(recorded.read().phase, "running");
  recorded.event(report);
  assert.equal(recorded.read().steelman, "result");
  assert.deepEqual(
    recorded
      .read()
      .steps?.slice(0, 3)
      .map(({ phase, active }) => [phase, active]),
    [
      ["start", []],
      ["running", ["builder"]],
      ["running", []],
    ],
  );
  assert.doesNotMatch(JSON.stringify(recorded.read()), /private/);
  const second = room(["operator"]);
  recorded.finish();
  assert.notEqual(second.read().id, recorded.read().id);
  assert.equal(second.read().phase, "start");
});

test("canceled and failed reviews stop and ignore late reports", () => {
  for (const terminate of ["finish", "error"] as const) {
    const feed = room(["builder"]);
    feed.event({ type: "progress", stage: "Feasibility", status: "running" });
    if (terminate === "finish") feed.finish();
    else feed.event({ type: "error", message: "private problem" });
    feed.event(report);
    assert.equal(feed.read().phase, "stopped");
    assert.equal(feed.read().steelman, "stopped");
    assert.deepEqual(feed.read().active, []);
    assert.doesNotMatch(JSON.stringify(feed.read()), /private/);
  }
});
