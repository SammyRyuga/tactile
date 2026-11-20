import { checkArithmetic } from "../server/arithmetic.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  demoClaims,
  demoProposal,
  demoReport,
  runDemo,
} from "../shared/demo.ts";
import {
  reportSchema,
  reviewInputSchema,
  toMarkdown,
} from "../shared/review.ts";
import type { ReviewEvent } from "../shared/review.ts";

test("bundled fixture reports the dependency failure and leaves timing unresolved", () => {
  const input = { proposal: demoProposal, claims: demoClaims.slice(0, 3) };
  const report = reportSchema.parse(demoReport(input));
  assert.deepEqual(
    report.findings.map(({ verdict }) => verdict),
    ["Contradicted", "Unresolved", "Weakened"],
  );
  const markdown = toMarkdown(input.proposal, report);
  assert.match(markdown, /## Recommended next step/);
  assert.match(markdown, /Bundled dependency replay/);
  assert.match(markdown, /Mode: Bundled demo/);
});

test("edited claims lose fixture citations and stay unresolved", () => {
  const claim = { ...demoClaims[0], text: "<img src=x> [bad](javascript:bad)" };
  const report = demoReport({ proposal: demoProposal, claims: [claim] });
  assert.equal(report.findings[0].verdict, "Unresolved");
  assert.deepEqual(report.sources, []);
  assert.doesNotMatch(
    toMarkdown(demoProposal, report),
    /(?<!\\)<img|(?<!\\)\[bad\]/,
  );
});

test("review validation requires one to three distinct non-empty claims", () => {
  const valid = { proposal: demoProposal, claims: demoClaims.slice(0, 3) };
  assert.equal(reviewInputSchema.safeParse(valid).success, true);
  assert.equal(
    reviewInputSchema.safeParse({ ...valid, claims: demoClaims }).success,
    false,
  );
  assert.equal(
    reviewInputSchema.safeParse({
      ...valid,
      claims: [demoClaims[0], demoClaims[0]],
    }).success,
    false,
  );
  assert.equal(
    reviewInputSchema.safeParse({
      ...valid,
      claims: [{ id: "x", text: "    " }],
    }).success,
    false,
  );
});

test("demo cancellation suppresses results and allows retry with the original input", async () => {
  const input = { proposal: demoProposal, claims: [demoClaims[0]] };
  const controller = new AbortController();
  const events: ReviewEvent[] = [];
  await assert.rejects(
    runDemo(
      input,
      (event) => {
        events.push(event);
        controller.abort();
      },
      controller.signal,
    ),
    { name: "AbortError" },
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "progress");
  await runDemo(
    input,
    (event) => events.push(event),
    new AbortController().signal,
  );
  assert.equal(events.at(-1)?.type, "report");
});

test("explicit arithmetic distinguishes valid, false, and undefined equations", () => {
  assert.deepEqual(
    checkArithmetic("0.1 + 0.2 = 0.3; 60 × 2 = 100. 5 / 0 = 0.").map(
      ({ actual, correct }) => [actual, correct],
    ),
    [
      [0.30000000000000004, true],
      [120, false],
      [null, false],
    ],
  );
});
