import assert from "node:assert/strict";
import test from "node:test";
import { extractLive, runLive } from "../src/api.ts";
import { startControlRoomFeed } from "../src/controlRoomFeed.ts";
import type { ReviewEvent, ReviewInput, Report } from "../shared/review.ts";
import { reviewerIds, reviewersSchema } from "../shared/reviewers.ts";

const input = {
  proposal: "Stress test a queue with isolated fixture records.",
  claims: [{ id: "a", text: "The queue preserves order at peak load." }],
  reviewers: ["builder"],
} satisfies ReviewInput;

const report: Report = {
  mode: "live",
  recommendation: "Measure order under load.",
  findings: [
    {
      claim: input.claims[0],
      verdict: "Unresolved",
      rationale: "No load data for 測試 🧪.",
      nextStep: "Capture a replay.",
      sourceIds: [],
    },
  ],
  sources: [],
};
const progress = {
  type: "progress",
  stage: "Feasibility",
  claimId: "a",
  status: "running",
} satisfies ReviewEvent;
const terminal = { type: "report", report } satisfies ReviewEvent;
const line = (value: unknown) => JSON.stringify(value) + "\n";
const encode = new TextEncoder();

test("review stream keeps one terminal report and discards unassigned updates", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        line({ ...progress, claimId: "unsubmitted" }) +
          line({ ...progress, stage: "Adoption" }) +
          line(progress) +
          line(terminal) +
          line({ ...terminal, report: { ...report, recommendation: "Extra" } }),
      ),
  );
  const seen: ReviewEvent[] = [];
  await runLive(input, (event) => seen.push(event), AbortSignal.timeout(1000));
  assert.deepEqual(seen, [progress, terminal]);
});

test("invalid responses never become completed reviews", async (t) => {
  const cases = [
    line({ ...terminal, report: { ...report, findings: [] } }),
    line({ ...terminal, report: { ...report, recommendation: " " } }),
    line({
      ...terminal,
      report: {
        ...report,
        findings: [{ ...report.findings[0], sourceIds: ["missing"] }],
      },
    }),
    line({ ...terminal, report: { ...report, mode: "demo" } }),
    line({ type: "unknown" }),
    "{\n",
    line(progress),
    line(terminal).trimEnd(),
    " ".repeat(2 * 1024 * 1024 + 1),
  ];
  let body = "";
  t.mock.method(globalThis, "fetch", async () => new Response(body));
  for (body of cases) {
    const seen: ReviewEvent[] = [];
    await assert.rejects(
      runLive(input, (event) => seen.push(event), AbortSignal.timeout(1000)),
      /review/i,
    );
    assert.ok(seen.every((event) => event.type !== "report"));
  }
});

test("all byte boundaries preserve a coalesced Unicode progress and report stream", async (t) => {
  const bytes = encode.encode(line(progress) + "\n" + line(terminal));
  let boundary = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, boundary));
            controller.enqueue(bytes.subarray(boundary));
            controller.close();
          },
        }),
      ),
  );
  for (boundary = 0; boundary <= bytes.length; boundary++) {
    const events: ReviewEvent[] = [];
    await runLive(
      input,
      (event) => events.push(event),
      AbortSignal.timeout(1000),
    );
    assert.deepEqual(events, [progress, terminal], `byte boundary ${boundary}`);
  }
});

test("client cancellation cancels a pending reader and emits no stale report", async (t) => {
  let cancel = false;
  const abort = new AbortController();
  let ready: () => void = () => {};
  const pending = new Promise<void>((resolve) => (ready = resolve));
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            ready();
          },
          cancel() {
            cancel = true;
          },
        }),
      ),
  );
  const events: ReviewEvent[] = [];
  const review = runLive(input, (event) => events.push(event), abort.signal);
  await pending;
  abort.abort();
  await assert.rejects(review, { name: "AbortError" });
  assert.equal(cancel, true);
  assert.deepEqual(events, []);
});

test("extraction rejects ambiguous duplicate claim identifiers", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ claims: [input.claims[0], input.claims[0]] }),
  );
  await assert.rejects(
    extractLive({ proposal: input.proposal }, AbortSignal.timeout(1000)),
    /assumptions/i,
  );
});

test("seeded lifecycle transitions preserve selection and stop after the first terminal event", () => {
  const seed = 0x02450f39;
  let state = seed;
  function next(max: number) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % max;
  }
  const stages = [
    "Assumptions",
    "Evidence",
    "Feasibility",
    "Adoption",
  ] as const;
  const statuses = ["running", "done", "unavailable", "skipped"] as const;
  let operations = 0;
  for (let mask = 0; mask < 16; mask++) {
    const panel = reviewerIds.filter((_id, bit) => mask & (1 << bit));
    assert.equal(reviewersSchema.safeParse(panel).success, mask !== 0);
    for (let run = 0; run < 5; run++) {
      const published: Parameters<
        Parameters<typeof startControlRoomFeed>[2]
      >[0][] = [];
      const feed = startControlRoomFeed(panel, "live", (value) =>
        published.push(value),
      );
      let terminalPhase: "stopped" | "ready" | undefined;
      for (let turn = 0; turn < 20; turn++) {
        const pick = next(17);
        if (pick === 0) {
          feed.finish();
          terminalPhase ??= "stopped";
        } else if (pick === 1) {
          feed.event(terminal);
          terminalPhase ??= "ready";
        } else {
          feed.event({
            type: "progress",
            stage: stages[next(stages.length)],
            status: statuses[next(statuses.length)],
            claimId: String(next(11)),
          });
        }
        operations++;
        const latest = published.at(-1)!;
        if (terminalPhase) {
          assert.equal(latest.phase, terminalPhase);
          assert.deepEqual(latest.active, []);
        }
        for (const role of reviewerIds.filter((id) => !panel.includes(id))) {
          assert.equal(latest.stations[role].state, "inactive");
          assert.ok(!latest.active.includes(role));
        }
      }
    }
  }
  assert.equal(operations, 1600);
});
