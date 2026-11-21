import {
  engineeringCheckSchema,
  evaluateEngineeringCheck,
} from "../shared/engineering.ts";
import { corpus } from "../scripts/evaluation-cases.ts";
import { sourceExcerpt } from "../server/source-reader.ts";
import { checkArithmetic } from "../server/arithmetic.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  demoClaims,
  demoExamples,
  demoProposal,
  demoReport,
  recordedConclusion,
  restoreDemoReport,
  runDemo,
} from "../shared/demo.ts";
import {
  reportSchema,
  reviewInputSchema,
  limits,
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

test("the rollback conclusion requires the recorded contradiction and its source", () => {
  const flag = demoExamples.find(({ id }) => id === "flag")!;
  const report = demoReport(flag);
  assert.equal(
    recordedConclusion(report),
    "Do not rely on the feature flag alone for rollback.",
  );
  assert.equal(recordedConclusion({ ...report, sources: [] }), undefined);
  assert.equal(recordedConclusion({ ...report, mode: "live" }), undefined);
  const edited = {
    ...flag.claims[0],
    text: "This rollout lowers hosting costs.",
  };
  assert.equal(
    recordedConclusion(
      demoReport({ ...flag, claims: [edited, flag.claims[1]] }),
    ),
    undefined,
  );
  for (const other of demoExamples.filter(({ id }) => id !== "flag"))
    assert.equal(recordedConclusion(demoReport(other)), undefined);
});

test("an unrelated replacement and an omitted critical claim get no original verdict", () => {
  const { proposal, claims } = demoExamples.find(({ id }) => id === "flag")!;
  const edited = {
    ...claims[0],
    risk: "evidence" as const,
    text: "The service reduces first-month hosting costs by 30 percent.",
  };
  for (const selected of [[edited, claims[1]], [claims[1]]]) {
    const report = reportSchema.parse(
      demoReport({ proposal, claims: selected }),
    );
    assert.deepEqual(report.uncheckedCriticalClaims, [claims[0].text]);
    assert.equal(
      report.findings.some(({ claim }) => claim.text === claims[0].text),
      false,
    );
    assert.deepEqual(
      report.findings.map(({ verdict }) => verdict),
      selected.length === 2 ? ["Unresolved", "Supported"] : ["Supported"],
    );
    if (selected.length === 2) {
      assert.match(
        report.findings[0].missingInformation!,
        /time window.*baseline/,
      );
      assert.deepEqual(report.findings[0].sourceIds, []);
    }
    assert.match(
      report.recommendation,
      /verify the unchecked claims separately/,
    );
    const memo = toMarkdown(proposal, report, "http://localhost:5173");
    assert.ok(memo.includes(proposal));
    assert.ok(memo.includes("- " + claims[0].text));
    assert.doesNotMatch(memo, /^### Contradicted/m);
    assert.doesNotMatch(memo, /localhost|127\.0\.0\.1/);
    assert.match(memo, /the update from request A is still present/);
    if (selected.length === 2) {
      const editedSection = memo.slice(
        memo.indexOf("### Unresolved"),
        memo.indexOf("### Supported"),
      );
      assert.match(editedSection, /time window.*baseline/);
      assert.doesNotMatch(
        editedSection,
        /Bundled flag timeline|Recorded fixture excerpt/,
      );
    }
  }
});

test("each portable recorded excerpt is copied from its named evidence section", () => {
  const evidence = readFileSync(
    new URL("../public/example-evidence.html", import.meta.url),
    "utf8",
  );
  for (const example of demoExamples) {
    const report = demoReport(example);
    for (const source of report.sources) {
      assert.equal(source.passageOrigin, "fixture");
      const anchor = new URL(source.url, "https://tactile.example").hash.slice(
        1,
      );
      const section = evidence
        .split('id="' + anchor + '"')[1]
        ?.split("</code></pre>")[0]
        ?.split("<pre><code>")[1];
      assert.ok(section?.includes(source.passage!), source.title);
      const portable = toMarkdown(
        example.proposal,
        report,
        "http://[::1]:5173",
      );
      assert.ok(portable.includes(source.passage!));
      assert.match(
        portable,
        /Recorded fixture excerpt from Tactile's bundled evidence/,
      );
      assert.doesNotMatch(portable, /\[::1\]/);
      const hosted = toMarkdown(
        example.proposal,
        report,
        "https://tactile.example",
      );
      assert.ok(hosted.includes("https://tactile.example" + source.url));
    }
  }
});

test("older saved demo reports retain verdicts and recover their coverage and recorded excerpts", () => {
  const { proposal, claims } = demoExamples.find(({ id }) => id === "flag")!;
  const legacyClaim = {
    ...claims[0],
    text: "Disabling the feature flag reverses records already changed by the migration.",
  };
  const current = demoReport({ proposal, claims: [legacyClaim] });
  const { id, title, url } = current.sources[0];
  const old = reportSchema.parse({
    ...current,
    uncheckedCriticalClaims: undefined,
    sources: [{ id, title, url: url.replace("/example-", "/demo-") }],
  });
  const restored = restoreDemoReport(proposal, old);
  assert.deepEqual(restored.findings, old.findings);
  assert.equal(restored.findings[0].verdict, "Contradicted");
  assert.deepEqual(restored.uncheckedCriticalClaims, []);
  assert.match(
    toMarkdown(proposal, restored),
    /the update from request A is still present/,
  );
});

test("ordinary punctuation stays readable and leading Markdown list markers stay escaped", () => {
  const report = demoReport({
    proposal: demoProposal,
    claims: [demoClaims[0]],
  });
  report.recommendation = "1. Recheck first-month timing.";
  report.findings[0].rationale = "- Do not treat <test> as markup.";
  const markdown = toMarkdown(demoProposal, report);
  assert.ok(markdown.includes("1\\. Recheck first-month timing."));
  assert.ok(markdown.includes("\\- Do not treat \\<test\\> as markup."));
});

test("citation destinations are serialized as safe Markdown URLs", () => {
  const report = demoReport({
    proposal: demoProposal,
    claims: [demoClaims[0]],
  });
  report.sources[0] = {
    ...report.sources[0],
    url: "https://example.com/a>\n?q=<tag>",
  };
  const markdown = toMarkdown(demoProposal, report);
  assert.match(markdown, /<https:\/\/example\.com\/a%3E\?q=%3Ctag%3E>/);
  assert.doesNotMatch(markdown, /<tag>/);
});

test("review validation accepts all drafted claims and rejects invalid selections", () => {
  const valid = {
    proposal: demoProposal,
    claims: Array.from({ length: limits.claims }, (_, index) => ({
      id: `claim-${index + 1}`,
      text: `Claim ${index + 1} can be tested independently.`,
    })),
  };
  assert.equal(reviewInputSchema.safeParse(valid).success, true);
  assert.equal(
    reviewInputSchema.safeParse({
      ...valid,
      claims: [...valid.claims, { id: "extra", text: "An extra claim." }],
    }).success,
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

test("engineering checks compare explicit budgets with consistent units", () => {
  for (const [kind, values, meets, result] of [
    ["retries", [3, 3, 26], false, /27 downstream attempts/],
    ["slo", [99.9, 99.9, 99.9], false, /99.8001/],
    ["timeout", [3, 100, 75, 350], false, /375 ms/],
    ["throughput", [60, 4, 4], true, /4 jobs\/s/],
    ["average", [5, 2, 9, 6, 7], false, /8 in the entered units/],
  ] as const) {
    const resultData = evaluateEngineeringCheck(
      engineeringCheckSchema.parse({ kind, values }),
    );
    assert.equal(resultData.meets, meets, kind);
    assert.match(resultData.observation, result);
  }
  assert.equal(
    engineeringCheckSchema.safeParse({ kind: "retries", values: [3.5, 2, 10] })
      .success,
    false,
  );
});
