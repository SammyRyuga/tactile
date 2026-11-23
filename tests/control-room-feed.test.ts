import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import type { ReviewEvent } from "../shared/review.ts";
import {
  controlRoomFeedKey,
  controlRoomSessionKey,
  startControlRoomFeed,
} from "../src/controlRoomFeed.ts";
import type { ControlRoomActivity } from "../src/controlRoomFeed.ts";

function localRoom(t: TestContext) {
  const entries = new Map<string, string>();
  const tab = new Map<string, string>();
  for (const [name, value] of Object.entries({
    location: { hostname: "localhost" },
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, item: string) => entries.set(key, item),
    },
    sessionStorage: {
      getItem: (key: string) => tab.get(key) ?? null,
      setItem: (key: string, item: string) => tab.set(key, item),
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }

  function read() {
    const data = entries.get(controlRoomFeedKey);
    assert.ok(data);
    return { data, snapshot: JSON.parse(data) as ControlRoomActivity };
  }

  read.session = () =>
    JSON.parse(
      tab.get(controlRoomSessionKey) ?? "null",
    ) as ControlRoomActivity & {
      steps: Pick<ControlRoomActivity, "phase" | "active">[];
    };

  return read;
}

test("the room keeps parallel work in flight and publishes only stage metadata", (t) => {
  const read = localRoom(t);
  const feed = startControlRoomFeed(["builder", "researcher", "operator"]);
  assert.ok(feed);
  assert.equal(read().snapshot.source, "live");
  assert.equal(read().snapshot.stations.builder.state, "queued");
  assert.equal(read().snapshot.stations.devils_advocate.state, "inactive");
  const claimA = "private-claim-a";
  const claimB = "private-claim-b";

  for (const claimId of [claimA, claimB]) {
    feed.event({
      type: "progress",
      stage: "Feasibility",
      status: "running",
      claimId,
      detail: "private progress details",
    });
  }
  feed.event({ type: "progress", stage: "Evidence", status: "running" });
  feed.event({
    type: "progress",
    stage: "Feasibility",
    status: "done",
    claimId: claimA,
  });
  feed.event({ type: "progress", stage: "Adoption", status: "skipped" });
  assert.deepEqual(read().snapshot.active, ["researcher", "builder"]);
  assert.deepEqual(read().snapshot.stations.builder, {
    state: "working",
    stages: ["Feasibility"],
  });
  assert.equal(read().snapshot.stations.operator.state, "skipped");
  assert.equal(read().snapshot.settled.includes("builder"), false);
  assert.doesNotMatch(read().data, /private/);

  feed.event({
    type: "progress",
    stage: "Feasibility",
    status: "unavailable",
    claimId: claimB,
  });
  assert.equal(read().snapshot.stations.builder.state, "unavailable");
  assert.equal(read().snapshot.settled.includes("builder"), true);
});

test("the embedded room can replay complete recorded feedback and ignores an obsolete run", (t) => {
  const read = localRoom(t);
  const recorded = startControlRoomFeed(["builder"], "recorded");
  assert.ok(recorded);
  recorded.event({
    type: "progress",
    stage: "Feasibility",
    status: "running",
    detail: "private data",
  });
  recorded.event({ type: "progress", stage: "Feasibility", status: "done" });
  const snapshot = read.session();
  assert.equal(snapshot.id, recorded.id);
  assert.deepEqual(
    snapshot.steps.map((step) => [step.phase, step.active]),
    [
      ["start", []],
      ["running", ["builder"]],
      ["running", []],
    ],
  );
  assert.doesNotMatch(JSON.stringify(snapshot), /private data/);
  const live = startControlRoomFeed(["operator"]);
  assert.ok(live);
  recorded.finish();
  assert.equal(read.session().id, live.id);
  assert.equal(read.session().phase, "start");
});

test("Steelman publishes a result only after a report and retains stopped runs", (t) => {
  const read = localRoom(t);
  const feed = startControlRoomFeed(["operator"]);
  assert.ok(feed);
  const progress = (
    stage: "Verification" | "Synthesis",
    status: "running" | "done",
  ) => feed.event({ type: "progress", stage, status });
  progress("Verification", "running");
  assert.equal(read().snapshot.steelman, "verifying");
  progress("Verification", "done");
  progress("Synthesis", "running");
  assert.equal(read().snapshot.steelman, "synthesizing");
  progress("Synthesis", "done");
  assert.equal(read().snapshot.phase, "running");
  assert.equal(read().snapshot.steelman, "waiting");
  const report: ReviewEvent = {
    type: "report",
    report: {
      mode: "live",
      findings: [],
      sources: [],
      recommendation: "private recommendation",
    },
  };
  feed.event(report);
  feed.finish();
  assert.equal(read().snapshot.steelman, "result");
  assert.equal(read().snapshot.phase, "ready");
  assert.doesNotMatch(read().data, /private/);

  const next = startControlRoomFeed(["builder"], "recorded");
  assert.ok(next);
  assert.equal(read.session().source, "recorded");
  assert.equal(read().snapshot.id, feed.id);
  next.finish();
  next.event(report);
  assert.equal(read.session().phase, "stopped");
  assert.equal(read.session().steelman, "stopped");
});
