import { corpus } from "../scripts/evaluation-cases.ts";
import { sourceExcerpt } from "../server/source-reader.ts";
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
  assert.match(markdown, /Mode: Bundled example/);
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

test("citation destinations are serialized as safe Markdown URLs", () => {
  const report = demoReport({
    proposal: demoProposal,
    claims: [demoClaims[0]],
  });
  report.sources[0].url = "https://example.com/a>\n?q=<tag>";
  const markdown = toMarkdown(demoProposal, report);
  assert.match(markdown, /<https:\/\/example\.com\/a%3E\?q=%3Ctag%3E>/);
  assert.doesNotMatch(markdown, /<tag>/);
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

test("arithmetic respects precedence, grouping, strict boundaries and stated rounding", () => {
  const equations =
    "Capacity: 1,000 + 500 × 2 = 2,000; (20 - 4) / 2 / 2 = 4; 1 / 3 = 0.33 (rounded to 2 decimal places); 2.675 + 0 = 2.68 (rounded to 2 decimal places)";
  assert.deepEqual(
    checkArithmetic(equations).map(({ actual, correct }) => [actual, correct]),
    [
      [2000, true],
      [4, true],
      [0.33, true],
      [2.68, true],
    ],
  );
  assert.deepEqual(
    checkArithmetic(
      "v1 + 2 = 3; 10 + 2 = 12%; 100,00 + 2 = 10002; 2 + 2 = 4...",
    ),
    [],
  );
});

test("arithmetic checks all six quantitative corpus sentences and rounded results with units", () => {
  const examples = [...corpus.development, ...corpus.holdout].filter(
    ([category]) => category === "quantitative",
  );
  assert.deepEqual(
    examples.map(([, , proposal]) =>
      checkArithmetic(proposal).map(({ actual, correct }) => [actual, correct]),
    ),
    [
      [[120, false]],
      [[600, true]],
      [[100, false]],
      [[210, false]],
      [[120, true]],
      [[100, false]],
    ],
  );
  assert.equal(
    checkArithmetic("The average is 100 / 3 = 33.33 requests per worker.")[0]
      ?.correct,
    true,
  );
  assert.equal(
    checkArithmetic("The average is 100 / 3 = 33.30 requests per worker.")[0]
      ?.correct,
    false,
  );
});

test("source excerpt prefers the cited sentence when the fetched page contains it", () => {
  const cited = "The write path commits before a standby catches up.";
  const body =
    "Words that describe replicas standby commit isolation. ".repeat(50) +
    cited;
  assert.ok(
    sourceExcerpt(body, "Replica commit isolation", cited).includes(cited),
  );
});

test("arithmetic tolerates floating-point noise in money-to-cents conversions", () => {
  const text =
    "Convert 1.1 * 100 = 110 cents; 0.07 * 100 = 7 cents; 19.99 * 100 = 1999 cents; 19.99 * 100 = 1998 cents.";
  assert.deepEqual(
    checkArithmetic(text).map(({ correct }) => correct),
    [true, true, true, false],
  );
  assert.equal(
    checkArithmetic("1. 60 * 2 = 100 jobs per minute")[0]?.correct,
    false,
  );
});

test("implicit integer rounding is distinguished from exact arithmetic errors", () => {
  for (const [text, correct, rounding] of [
    ["100 / 3 = 33.3", true, undefined],
    ["100 / 3 = 33", false, "nearest integer"],
    ["1000 / 7 = 142 requests", false, "floor"],
    ["100 / 3 = 34 workers", false, "ceiling"],
    ["100 / 3 = exactly 33", false, undefined],
    ["100 / 3 = 33 (rounded to 0 decimal places)", true, undefined],
    ["100 / 3 = 30 requests", false, undefined],
  ] as const) {
    const [finding] = checkArithmetic(text);
    assert.equal(finding?.correct, correct, text);
    assert.equal(finding?.rounding, rounding, text);
  }
});

test("a partial right-hand expression cannot produce a deterministic verdict", () => {
  assert.deepEqual(checkArithmetic("2 + 2 = 5 - 1; 12 / 2 = 12 / 2"), []);
});
