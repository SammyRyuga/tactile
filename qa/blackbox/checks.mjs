import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";

export const origin =
  process.env.TACTILE_BLACKBOX_URL ?? "http://127.0.0.1:5173";
if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin))
  throw new Error("Use an explicit local IPv4 loopback URL.");
const check = expect.configure({ timeout: 2200 });
export const scenarios = {
  flag: {
    link: /Rollout safety/,
    title: /Use a feature flag/,
    proposal: /record writer/,
    claims: [/reverses changes/, /prevents future requests/],
    verdicts: ["Contradicted", "Supported"],
    next: /tested data repair or a reversible write strategy/,
    anchors: ["flag-timeline"],
  },
  ci: {
    link: /CI coverage/,
    title: /Run fewer tests/,
    proposal: /pull request/,
    claims: [
      /only the changed package/,
      /reduces pull request feedback time/,
      /full tests on main/,
      /choose which test command/,
    ],
    verdicts: ["Contradicted", "Unresolved", "Weakened", "Supported"],
    next: /affected-package testing with dependent packages/,
    anchors: ["dependency-replay", "rollout-configuration"],
  },
  replica: {
    link: /Data consistency/,
    title: /Move checkout reads/,
    proposal: /replica/,
    claims: [/always returns an order/, /lowers checkout p95 latency/],
    verdicts: ["Contradicted", "Unresolved"],
    next: /immediate order lookups on the primary/,
    anchors: ["replica-timeline"],
  },
};
const cpu =
  "Disabling the feature flag reduces database CPU usage by 73% in every region.";
const downtime =
  "The rollout guarantees zero downtime in every geographic region.";
const critical =
  /Disabling the feature flag reverses changes the new writer already made/;
const cases = [];
const button = (p, name) =>
  p.getByRole("button", { name, exact: typeof name === "string" });
const heading = (p, name) =>
  p.getByRole("heading", { name, exact: typeof name === "string" });
const field = (p, n) =>
  p.getByRole("textbox", { name: "Assumption " + n, exact: true });
const include = (p, n) =>
  p.getByRole("checkbox", { name: "Include assumption " + n, exact: true });
const detail = (p, label) => p.locator("summary").filter({ hasText: label });
const coverage = (p) => p.getByRole("region", { name: "Claim coverage" });
const cards = (p) => p.getByRole("article");
const card = (p, statement) => cards(p).filter({ has: heading(p, statement) });
const exact = (p, words) => p.getByText(words, { exact: true });
const stage = (p) => p.locator('[aria-current="step"]');

function test(id, title, steps, expected, run) {
  cases.push({
    id: "BB-" + String(id).padStart(3, "0"),
    title,
    steps,
    expected,
    run,
  });
}

async function go(p, example = "flag") {
  await p.goto(
    origin + "/demo" + (example === null ? "" : "?example=" + example),
  );
  await check(heading(p, "Public demo")).toBeVisible();
}
async function edit(p) {
  await button(p, "Review example").click();
  await check(heading(p, "Review assumptions")).toBeVisible();
}
async function run(p) {
  await button(p, "Run checks").click();
  await result(p);
}
async function result(p) {
  await check(heading(p, "Review results")).toBeVisible();
}
async function review(p, id = "flag") {
  await go(p, id);
  await edit(p);
  await run(p);
}
async function add(p, n, value) {
  await button(p, "Add assumption").click();
  await field(p, n).fill(value);
  await include(p, n).check();
}
async function file(p, output, normalize = true) {
  const pending = p.waitForEvent("download", { timeout: 3000 });
  await button(p, "Export Markdown").click();
  const downloaded = await pending;
  assert.match(downloaded.suggestedFilename(), /\.md$/i);
  const body = await readFile(await downloaded.path(), "utf8");
  if (output) await writeFile(output, body);
  return normalize ? body.replace(/\r\n/g, "\n") : body;
}
async function verdict(p, statement, value) {
  const entry = card(p, statement);
  await check(entry.getByRole("heading", { level: 3 })).toBeVisible();
  await check(exact(entry, value)).toBeVisible();
  return entry;
}
async function unsupported(p, statement) {
  const entry = await verdict(p, statement, "Unresolved");
  await check(exact(entry, "Evidence insufficient")).toBeVisible();
  await check(entry.getByText("What would settle it")).toBeVisible();
  await check(entry.getByRole("link")).toHaveCount(0);
  return entry;
}
async function gap(p) {
  await check(coverage(p)).toContainText(
    "Original critical claims left unchecked",
  );
  await check(coverage(p)).toContainText(critical);
  await check(
    heading(p, "Do not rely on the feature flag alone for rollback."),
  ).toHaveCount(0);
  await check(
    p.getByText(/verify the unchecked claims separately/),
  ).toBeVisible();
}
async function baseline(p, id) {
  const { claims, verdicts, next } = scenarios[id];
  await check(cards(p)).toHaveCount(claims.length);
  for (const [i, claim] of claims.entries())
    await verdict(p, claim, verdicts[i]);
  await check(p.getByText(next)).toBeVisible();
}
async function layout(p, names) {
  const size = await p.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    size.document <= size.viewport + 1,
    "Horizontal overflow: " + JSON.stringify(size),
  );
  for (const name of names) {
    const control = button(p, name);
    await check(control).toBeVisible();
    const fits = await control.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return left >= -1 && right <= document.documentElement.clientWidth + 1;
    });
    assert.ok(fits, "Control extends past the viewport: " + name);
  }
  return size.viewport;
}
async function appearances(p) {
  return p.evaluate(() => ({
    root: getComputedStyle(document.documentElement).colorScheme,
    body: getComputedStyle(document.body).backgroundColor,
    main: getComputedStyle(document.querySelector("main")).color,
  }));
}
function stop(reason) {
  return { blocked: reason };
}

test(
  1,
  "Fresh anonymous visit",
  "Open bare /demo in a clean browser; read the plan, inspect loaded images, page errors, console errors and network.",
  "Public demo and sample plan render without credentials, errors or redirects.",
  async ({ p, errors, network }) => {
    await go(p, null);
    await check(heading(p, scenarios.flag.title)).toBeVisible();
    await check(button(p, "Review example")).toBeEnabled();
    assert.equal(new URL(p.url()).pathname, "/demo");
    assert.deepEqual(
      await p
        .locator("img")
        .evaluateAll((images) =>
          images.filter((i) => i.complete && !i.naturalWidth).map((i) => i.alt),
        ),
      [],
    );
    assert.deepEqual(errors, []);
    assert.equal(
      network.some((r) => r.status >= 400),
      false,
    );
    return "Public demo, plan and start control loaded on /demo; no broken images, failed HTTP response or browser error.";
  },
);

test(
  2,
  "Primary navigation",
  "Open flag plan, click Review example, then Run checks. Read the active step at each stage.",
  "One active marker agrees with the displayed Plan, Assumptions and Results stages.",
  async ({ p }) => {
    await go(p);
    await check(stage(p)).toHaveText(/Plan/);
    await edit(p);
    await check(stage(p)).toHaveText(/Assumptions/);
    await run(p);
    await check(stage(p)).toHaveText(/Results/);
    return "Active marker matched all three workflow stages.";
  },
);

test(
  3,
  "Example switching",
  "Use the library to select CI, replica and flag in order; open assumptions, run, then Choose another example.",
  "Plan, assumptions and results belong to the library selection.",
  async ({ p }) => {
    await go(p);
    for (const id of ["ci", "replica", "flag"]) {
      const s = scenarios[id];
      await p.getByRole("link", { name: s.link }).click();
      await check(heading(p, s.title)).toBeVisible();
      await check(p.getByRole("textbox", { name: "Bundled plan" })).toHaveValue(
        s.proposal,
      );
      await edit(p);
      await check(field(p, 1)).toHaveValue(s.claims[0]);
      await run(p);
      await baseline(p, id);
      await button(p, "Choose another example").click();
    }
    return "CI, replica and flag had their own proposals, claims and recorded verdicts through library switching.";
  },
);

test(
  4,
  "Invalid example IDs",
  "Open ?example=unknown, ?example=, /demo, ?example=CI and ?example=RePLiCa.",
  "Each variant displays a usable example without a crash, blank document or unhandled error.",
  async ({ p, errors }) => {
    const shown = [];
    for (const value of ["unknown", "", null, "CI", "RePLiCa"]) {
      await p.goto(
        origin + "/demo" + (value === null ? "" : "?example=" + value),
      );
      if (value !== null) {
        await check(heading(p, "Demo case unavailable")).toBeVisible();
        await p.getByRole("link", { name: scenarios.flag.link }).click();
        shown.push(value || "(empty)");
      }
      await check(heading(p, "Public demo")).toBeVisible();
      await check(
        p.getByRole("textbox", { name: "Bundled plan" }),
      ).not.toHaveValue("");
      await check(button(p, "Review example")).toBeEnabled();
    }
    assert.deepEqual(errors, []);
    return (
      "Bare /demo opened flag; " +
      shown.join(", ") +
      " showed an unavailable-case message and working library recovery."
    );
  },
);

test(
  5,
  "Browser Back and Forward",
  "Open flag, switch to CI via library, edit claim 1 and run. Browser Back, Forward, and Back again. Inspect scenario, stage and saved draft.",
  "Browser history preserves internally consistent scenarios and drafts and permits returning to the stage just visited.",
  async ({ p }) => {
    await go(p);
    await p.getByRole("link", { name: scenarios.ci.link }).click();
    await edit(p);
    await field(p, 1).fill(cpu);
    await run(p);
    const stops = [];
    for (const [action, expected] of [
      ["goBack", "Assumptions"],
      ["goForward", "Results"],
      ["goBack", "Assumptions"],
    ]) {
      await p[action]({ waitUntil: "commit" });
      await check(stage(p)).toContainText(expected);
      if (expected === "Assumptions") await check(field(p, 1)).toHaveValue(cpu);
      stops.push(
        (await stage(p).innerText()).replace(/\s+/g, " ") +
          " " +
          new URL(p.url()).search,
      );
    }
    await p.goForward({ waitUntil: "commit" });
    await result(p);
    await button(p, "Edit assumptions").click();
    await check(field(p, 1)).toHaveValue(cpu);
    assert.match(
      stops[0],
      /Assumptions/,
      "Browser history skipped workflow stages; stops: " +
        stops.join(" → ") +
        "; edited draft survived on Forward.",
    );
    return "Browser history and saved draft restored: " + stops.join(" → ");
  },
);

test(
  6,
  "Default assumptions",
  "Open each scenario, check all default selections, run, and compare results with the selected scenario.",
  "Each included default appears once and receives its recorded verdict.",
  async ({ p }) => {
    for (const id of Object.keys(scenarios)) {
      await go(p, id);
      await edit(p);
      for (let i = 1; i <= scenarios[id].claims.length; i += 1)
        await check(include(p, i)).toBeChecked();
      await run(p);
      await baseline(p, id);
    }
    return "All defaults selected; report claim counts were flag 2, CI 4 and replica 2.";
  },
);

test(
  7,
  "Deselect critical assumption",
  "Uncheck flag claim 1, leave claim 2 checked, then run.",
  "Warn that the original critical rollback claim is unchecked; avoid approval of rollback; only show claim 2.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await include(p, 1).uncheck();
    await run(p);
    await gap(p);
    await check(cards(p)).toHaveCount(1);
    await verdict(p, scenarios.flag.claims[1], "Supported");
    return "Original rollback listed under unchecked coverage; only future writes shown as Supported.";
  },
);

test(
  8,
  "Deselect every assumption",
  "Uncheck both flag claims, try keyboard activation of Run checks, then reselect one and run.",
  "Disabled submission with explanatory feedback; a valid selection restores the action.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await include(p, 1).uncheck();
    await include(p, 2).uncheck();
    await check(button(p, "Run checks")).toBeDisabled();
    await check(p.getByText(/Include at least one assumption/)).toBeVisible();
    await p.keyboard.press("Enter");
    await check(heading(p, "Review assumptions")).toBeVisible();
    await include(p, 1).check();
    await run(p);
    return "Zero-selection validation explained the disabled action; rechecking one claim restored review.";
  },
);

test(
  9,
  "Select one original assumption",
  "Submit each flag claim by itself, using Edit assumptions between runs. Inspect sources and warnings.",
  "Each result refers only to the included claim and its correct source; the critical scope gap appears when claim 1 is excluded.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await include(p, 2).uncheck();
    await run(p);
    await check(cards(p)).toHaveCount(1);
    await check(coverage(p)).toHaveCount(0);
    const first = await verdict(p, scenarios.flag.claims[0], "Contradicted");
    await check(
      first.getByRole("link", { name: /Bundled flag timeline/ }),
    ).toBeVisible();
    await button(p, "Edit assumptions").click();
    await include(p, 1).uncheck();
    await include(p, 2).check();
    await run(p);
    await gap(p);
    await check(cards(p)).toHaveCount(1);
    const second = await verdict(p, scenarios.flag.claims[1], "Supported");
    await check(
      second.getByRole("link", { name: /Bundled flag timeline/ }),
    ).toBeVisible();
    return "Both single-claim runs correctly scoped the timeline and warned only when the critical claim was missing.";
  },
);

test(
  10,
  "Replace with an unrelated claim",
  "Replace flag claim 1 with the specified 73% database CPU statement and run.",
  "Edited claim Unresolved without sources; original critical rollback claim clearly unchecked.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await field(p, 1).fill(cpu);
    await run(p);
    await unsupported(p, cpu);
    await gap(p);
    return "73% CPU claim Unresolved without citation; original rollback assumption called out as unchecked.";
  },
);

test(
  11,
  "Add unrelated claim",
  "Keep defaults, add the specified zero-downtime-in-every-region statement, then run.",
  "New statement is Unresolved with no invented evidence; default outcomes stay intact.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await add(p, 3, downtime);
    await run(p);
    await check(cards(p)).toHaveCount(3);
    await verdict(p, scenarios.flag.claims[0], "Contradicted");
    await verdict(p, scenarios.flag.claims[1], "Supported");
    await unsupported(p, downtime);
    return "Zero-downtime claim was Unresolved without sources; both recorded findings remained.";
  },
);

test(
  12,
  "Delete original critical assumption",
  "Click Remove assumption 1 in flag, inspect the remaining input and run.",
  "Only the future-writes claim remains; missing rollback coverage is explicit.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await button(p, "Remove assumption 1").click();
    await check(field(p, 1)).toHaveValue(scenarios.flag.claims[1]);
    await run(p);
    await gap(p);
    await check(cards(p)).toHaveCount(1);
    await verdict(p, scenarios.flag.claims[1], "Supported");
    return "Deletion preserved the optional claim and explicitly reported the lost rollback coverage.";
  },
);

test(
  13,
  "Duplicate assumptions",
  "Add two identical zero-downtime claims, toggle claim 3 off, edit claim 4, re-include claim 3 and add another identical claim. Run and inspect cards.",
  "Rows remain independently editable and selectable; headings repeat only for included duplicates, each without evidence.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await add(p, 3, downtime);
    await add(p, 4, downtime);
    await include(p, 3).uncheck();
    await field(p, 4).fill(cpu);
    await include(p, 3).check();
    await add(p, 5, downtime);
    await run(p);
    await check(cards(p)).toHaveCount(5);
    await check(card(p, downtime)).toHaveCount(2);
    for (const entry of await card(p, downtime).all()) {
      await check(exact(entry, "Unresolved")).toBeVisible();
      await check(entry.getByRole("link")).toHaveCount(0);
    }
    await unsupported(p, cpu);
    return "Three added rows stayed independent; two included duplicates were distinct report cards without evidence.";
  },
);

test(
  14,
  "Empty and whitespace validation",
  "Replace included claim 1 with empty text, attempt Run; repeat with spaces; re-enter valid text and run.",
  "Invalid text cannot produce a report and the reason is visible; corrected text is accepted.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    const observations = [];
    for (const value of ["", "   "]) {
      await field(p, 1).fill(value);
      if (await button(p, "Run checks").isEnabled())
        await button(p, "Run checks").click();
      await check(heading(p, "Review assumptions")).toBeVisible();
      await check(p.getByRole("alert")).toHaveText(
        "Write a statement for each assumption you want to check.",
      );
      observations.push(true);
    }
    await field(p, 1).fill(cpu);
    await run(p);
    await unsupported(p, cpu);
    assert.deepEqual(
      observations,
      [true, true],
      "Could not identify a visible validation reason for empty/whitespace inputs: " +
        observations.join(", "),
    );
    return "Empty and spaces were rejected with feedback; correction allowed the review.";
  },
);

test(
  15,
  "Maximum-length assumption",
  "Read the advertised input limit, fill to that limit, submit, then open the actual Markdown file and look for the same text.",
  "Maximum-length content stays readable and complete in UI and export.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    const maximum = Number(await field(p, 1).getAttribute("maxlength"));
    assert.ok(maximum > 50 && maximum <= 2000);
    const claim =
      "A sustained recovery target is needed. " +
      "x".repeat(maximum - 43) +
      " END";
    const value = claim.padEnd(maximum, "Z").slice(0, maximum);
    await field(p, 1).fill(value);
    await check(field(p, 1)).toHaveValue(value);
    await run(p);
    await unsupported(p, value);
    const md = await file(p);
    assert.ok(
      md.includes(value),
      "Markdown dropped or altered the maximum-length claim.",
    );
    await layout(p, ["Copy Markdown", "Export Markdown"]);
    return (
      maximum +
      " characters were preserved in the claim editor, report heading and downloaded Markdown."
    );
  },
);

test(
  16,
  "Special characters",
  "Enter a two-line claim with emoji, Unicode, Markdown markers, quotes, angle brackets and ≤/² notation; run and download.",
  "Preserve the content and Markdown safety; verify treatment of line boundaries.",
  async ({ p }) => {
    const claim =
      'Latency ≤ 7² ms 🙂; café "two" **checks** <tag>.\nSecond line: Δ ≥ 0.';
    await go(p);
    await edit(p);
    await field(p, 1).fill(claim);
    await check(field(p, 1)).toHaveValue(claim);
    await run(p);
    const entry = await unsupported(p, /Latency ≤ 7² ms/);
    const ui = await entry.getByRole("heading", { level: 3 }).textContent();
    const md = await file(p);
    assert.ok(ui.includes("café") && ui.includes("Δ ≥ 0"));
    assert.ok(md.includes("🙂") && md.includes("café") && md.includes("Δ ≥ 0"));
    assert.ok(
      !md.includes("<tag>"),
      "Angle brackets rendered as Markdown HTML syntax.",
    );
    return (
      "Unicode, emoji, mathematical symbols and both lines’ wording survived; heading line boundary " +
      (ui.includes("\n") ? "retained in DOM" : "flattened in DOM") +
      ", " +
      (md.includes("\nSecond line") ? "retained" : "flattened") +
      " in Markdown."
    );
  },
);

test(
  17,
  "Rapid edit and submit",
  "Fill one unrelated value, replace it with the 73% statement using a keyboard paste-equivalent, immediately click Run checks.",
  "Only the latest value reaches the result.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await field(p, 1).fill(downtime);
    await field(p, 1).focus();
    await p.keyboard.press("Control+A");
    await p.keyboard.insertText(cpu);
    await button(p, "Run checks").click();
    await result(p);
    await unsupported(p, cpu);
    await check(card(p, downtime)).toHaveCount(0);
    return "The latest edit reached the report; the superseded text did not.";
  },
);

test(
  18,
  "Flag outcome attribution",
  "Run the flag defaults and inspect both verdicts and reasons.",
  "Stored writes Contradicted; prevention of future flagged writes Supported, each with a scoped explanation.",
  async ({ p }) => {
    await review(p);
    await baseline(p, "flag");
    await check(card(p, scenarios.flag.claims[0])).toContainText(
      /mutation in storage after/,
    );
    await check(card(p, scenarios.flag.claims[1])).toContainText(
      /new requests evaluate the flag/,
    );
    return "The persisted change and subsequent request used separate verdicts and reasons.";
  },
);

test(
  19,
  "CI outcome attribution",
  "Run default CI and inspect the claim wording, status and available evidence on each card.",
  "Consumer coverage Contradicted, timing Unresolved, post-merge fallback Weakened; scope links to their claims.",
  async ({ p }) => {
    await review(p, "ci");
    await baseline(p, "ci");
    await check(card(p, scenarios.ci.claims[0])).toContainText(
      /checkout test fails/,
    );
    await unsupported(p, scenarios.ci.claims[1]);
    await check(card(p, scenarios.ci.claims[2])).toContainText(/after merge/);
    return "Consumer coverage Contradicted, timing Unresolved, post-merge fallback Weakened; the fourth workflow-choice claim Supported.";
  },
);

test(
  20,
  "Replica outcome attribution",
  "Run default replica, read the ordering and latency cards.",
  "Immediate order reads Contradicted, p95 Unresolved; ordering gap is explained.",
  async ({ p }) => {
    await review(p, "replica");
    await baseline(p, "replica");
    await check(card(p, scenarios.replica.claims[0])).toContainText(
      /between primary commit and replica replay/,
    );
    await unsupported(p, scenarios.replica.claims[1]);
    return "Immediate reads Contradicted with commit/replay gap; p95 Unresolved without citation.";
  },
);

test(
  21,
  "False reassurance under lost coverage",
  "Separately deselect, remove and edit flag claim 1 while keeping claim 2. Run each and inspect the overall recommendation and all card headings.",
  "Supported secondary claim never becomes approval of the rollback strategy; original unchecked claim has no inferred verdict.",
  async ({ p }) => {
    for (const editCritical of [
      () => include(p, 1).uncheck(),
      () => button(p, "Remove assumption 1").click(),
      () => field(p, 1).fill(cpu),
    ]) {
      await go(p);
      await edit(p);
      await editCritical();
      await run(p);
      await gap(p);
      await verdict(p, scenarios.flag.claims[1], "Supported");
      await check(card(p, scenarios.flag.claims[0])).toHaveCount(0);
      await button(p, "Choose another example").click();
    }
    return "All three inputs retained a supported secondary claim, warned on unchecked rollback and gave it no verdict.";
  },
);

test(
  22,
  "Near-match evidence attribution",
  "Edit the CI consumer coverage claim by changing its subject to dependency-free packages; submit.",
  "Different claim is Unresolved without reusing the original dependency replay.",
  async ({ p }) => {
    await go(p, "ci");
    await edit(p);
    const newClaim =
      "Testing dependency-free packages individually catches regressions in other repositories.";
    await field(p, 1).fill(newClaim);
    await run(p);
    await unsupported(p, newClaim);
    await check(card(p, scenarios.ci.claims[0])).toHaveCount(0);
    return "The edited CI claim got no recycled dependency replay or original verdict.";
  },
);

test(
  23,
  "Conflicting custom claims",
  "Add opposite statements about staging keeping archived rows indefinitely and submit.",
  "Both arbitrary claims remain Unresolved unless the recorded evidence directly covers them.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    const first = "Staging retains archived rows indefinitely.";
    const second = "Staging never retains archived rows indefinitely.";
    await add(p, 3, first);
    await add(p, 4, second);
    await run(p);
    await unsupported(p, first);
    await unsupported(p, second);
    return "Both conflicting claims were Unresolved with no source or implication of a live check.";
  },
);

test(
  24,
  "Recommendation consistency",
  "Run all defaults and one modified flag report; compare each report card’s claim, verdict, next step and missing coverage with its Markdown.",
  "Both surfaces communicate matching verdicts, supported scope, warnings and recommended action.",
  async ({ p }) => {
    for (const id of Object.keys(scenarios)) {
      await review(p, id);
      const md = await file(p);
      assert.match(md, scenarios[id].next);
      for (const [i, entry] of (await cards(p).all()).entries()) {
        const title = await entry
          .getByRole("heading", { level: 3 })
          .innerText();
        assert.ok(md.includes(scenarios[id].verdicts[i] + " · " + title));
        const next = await entry
          .locator("p")
          .filter({ hasText: /^Next step/ })
          .first()
          .innerText();
        assert.ok(
          md.includes(next.replace(/^Next step\s*/, "")),
          "Markdown omitted next step for " + title,
        );
      }
      await button(p, "Choose another example").click();
    }
    await go(p);
    await edit(p);
    await field(p, 1).fill(cpu);
    await run(p);
    await gap(p);
    const md = await file(p);
    assert.match(md, /original critical claims left unchecked/i);
    assert.ok(md.includes("Unresolved · " + cpu));
    return "All default verdicts and card actions matched the memo; modified memo preserved Unresolved status and scope warning.";
  },
);

test(
  25,
  "Review trails",
  "Run all default reports. Expand every Review trail and read each status, observation and source.",
  "Every disclosed check agrees with its card, contains a status and observation, and any evidence is attributed.",
  async ({ p }) => {
    let total = 0;
    const seen = new Set();
    for (const id of Object.keys(scenarios)) {
      await review(p, id);
      for (const summary of await detail(p, /Review trail/).all()) {
        await summary.click();
        const group = summary.locator("..");
        const reports = await group.getByRole("heading", { level: 4 }).all();
        assert.ok(reports.length > 0);
        for (const report of reports) {
          const name = await report.innerText();
          assert.match(name, /complete|skipped|incomplete/i);
          seen.add(name.replace(/\s+/g, " "));
          await check(
            report.locator("..").locator("p").first(),
          ).not.toBeEmpty();
        }
        const article = summary.locator("xpath=ancestor::article");
        const sources = await article
          .getByRole("list", { name: "Sources" })
          .getByRole("link")
          .evaluateAll((links) => links.map((l) => l.href));
        const citations = await group
          .getByRole("link")
          .evaluateAll((links) => links.map((l) => l.href));
        assert.ok(citations.every((link) => sources.includes(link)));
        total += 1;
      }
    }
    assert.ok(total >= 7);
    return (
      "Opened " +
      total +
      " claim trails. Displayed check statuses: " +
      [...seen].join(", ") +
      "."
    );
  },
);

test(
  26,
  "Bundled source navigation",
  "Open all published sources, including links within expanded trails. Navigate each unique destination in Chromium and inspect its hash target.",
  "All sources lead to the referenced, nonempty local evidence section.",
  async ({ p, context }) => {
    const seen = new Set();
    let appearances = 0;
    for (const id of Object.keys(scenarios)) {
      await review(p, id);
      for (const summary of await detail(p, /Review trail/).all())
        await summary.click();
      for (const href of await p
        .getByRole("article")
        .getByRole("link")
        .evaluateAll((links) => links.map((l) => l.href))) {
        const url = new URL(href);
        assert.equal(url.origin, origin);
        assert.ok(scenarios[id].anchors.includes(url.hash.slice(1)));
        appearances += 1;
        if (seen.has(href)) continue;
        const source = await context.newPage();
        const response = await source.goto(href);
        assert.equal(response.status(), 200);
        assert.equal(new URL(source.url()).hash, url.hash);
        const destination = source.locator(url.hash);
        await check(destination).toBeVisible();
        await check(destination).not.toBeEmpty();
        await check(
          destination.locator("xpath=following-sibling::pre[1]"),
        ).toBeVisible();
        await source.close();
        seen.add(href);
      }
    }
    assert.equal(seen.size, 4);
    return (
      appearances +
      " citation appearances resolved to all four expected evidence anchors (HTTP 200)."
    );
  },
);

test(
  27,
  "Explicit insufficient evidence",
  "Inspect unsupported default CI timing and replica latency claims, then an unrelated added flag claim.",
  "Each identifies the evidence gap, what would settle it and has no source invented.",
  async ({ p }) => {
    for (const id of ["ci", "replica"]) {
      await review(p, id);
      await unsupported(p, scenarios[id].claims[1]);
    }
    await go(p);
    await edit(p);
    await add(p, 3, downtime);
    await run(p);
    await unsupported(p, downtime);
    return "Three uncovered claims clearly said Evidence insufficient and provided a next evidence step without a citation.";
  },
);

test(
  28,
  "Review-room status integrity",
  "Collect check statuses from the expanded claim trails, then open the review room in all examples and select each station and memo.",
  "Room states agree with trail states, and Memo ready remains distinguishable from completed specialist checks.",
  async ({ p }) => {
    const observed = new Set();
    for (const id of Object.keys(scenarios)) {
      await review(p, id);
      const trails = new Map();
      for (const summary of await detail(p, /Review trail/).all()) {
        await summary.click();
        for (const text of await summary
          .locator("..")
          .getByRole("heading", { level: 4 })
          .allTextContents()) {
          const match = text
            .trim()
            .match(
              /^(Assumptions|Feasibility|Adoption|Evidence)\s*(Complete|Skipped|Incomplete)$/i,
            );
          assert.ok(match, "Unrecognized recorded trail: " + text);
          const states = trails.get(match[1].toLowerCase()) ?? new Set();
          states.add(match[2].toLowerCase());
          trails.set(match[1].toLowerCase(), states);
        }
      }
      await detail(p, "See the review room").click();
      const stations = p.getByRole("group", { name: "Review stations" });
      await check(stations.getByRole("button")).toHaveCount(5);
      for (const station of await stations.getByRole("button").all()) {
        const visible = (await station.innerText()).trim().replace(/\s+/g, " ");
        const name = (await station.getAttribute("aria-label")) ?? visible;
        await station.click();
        observed.add(name);
        const words = name.toLowerCase().split(" ");
        const [label, state] = [words[0], words.slice(1).join(" ")];
        if (label === "decision") {
          assert.equal(state, "memo memo ready");
        } else if (state === "not included in this example") {
          assert.equal(
            trails.has(label),
            false,
            "Station marked absent despite a recorded check: " + name,
          );
        } else {
          assert.ok(
            trails.get(label)?.has(state),
            "Station state absent from trails: " + name,
          );
        }
      }
    }
    return (
      [...observed].join("; ") +
      ". Any live-only transitions remain outside this check."
    );
  },
);

test(
  29,
  "Portable Markdown evidence",
  "Download each default report, open all four public source anchors, and compare provenance, excerpt, proposal, verdict headings and recommendation.",
  "Each file is self-contained, contains the published excerpt and provenance, and has no localhost URLs.",
  async ({ p, context, out, label }) => {
    for (const id of Object.keys(scenarios)) {
      await review(p, id);
      await detail(p, "Read your plan").click();
      const plan = await p
        .getByRole("group")
        .filter({ hasText: /Read your plan/ })
        .innerText();
      const md = await file(p, join(out, label + "-" + id + ".md"));
      assert.match(md, /^# Tactile decision review/m);
      assert.match(md, /Mode: Bundled example/);
      assert.match(md, scenarios[id].proposal);
      assert.match(md, scenarios[id].next);
      assert.ok(
        md.includes(plan.replace(/^Read your plan\s*/, "").trim()),
        "Memo proposal and revealed plan differ.",
      );
      assert.doesNotMatch(
        md,
        /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/])/i,
      );
      for (const value of scenarios[id].verdicts)
        assert.ok(md.includes("### " + value + " · "));
      for (const anchor of scenarios[id].anchors) {
        assert.ok(
          md.includes("public/example-evidence.html#" + anchor),
          "Missing provenance: " + anchor,
        );
        const evidence = await context.newPage();
        await evidence.goto(origin + "/example-evidence.html#" + anchor);
        const published = (
          await evidence
            .locator("#" + anchor)
            .locator("xpath=following-sibling::pre[1]")
            .textContent()
        ).trim();
        const excerpts = md.split(/\n\n/).flatMap((part, index, parts) => {
          if (!part.includes("public/example-evidence.html#" + anchor))
            return [];
          const fenced = (parts[index + 1] ?? "").trim();
          const match = fenced.match(/^\x60{3}\n([\s\S]+)\n\x60{3}$/);
          return [match?.[1] ?? ""];
        });
        assert.ok(
          excerpts.length > 0 &&
            excerpts.every(
              (excerpt) => excerpt.length >= 25 && published.includes(excerpt),
            ),
          "A portable excerpt does not match the cited public source: " +
            anchor,
        );
        await evidence.close();
      }
    }
    return "Three actual Markdown files included preserved proposals, recorded verdicts and recommendations, and verbatim excerpts for four published anchors without localhost links.";
  },
);

test(
  30,
  "Modified Markdown export",
  "Export flag both after replacing rollback with the 73% claim and after excluding original rollback.",
  "Preserve the unchecked critical claim separately from verdicts and include only evidence applicable to the remaining checked claims.",
  async ({ p, out, label }) => {
    for (const [name, change] of [
      ["edited", () => field(p, 1).fill(cpu)],
      ["excluded", () => include(p, 1).uncheck()],
    ]) {
      await go(p);
      await edit(p);
      await change();
      await run(p);
      await gap(p);
      const md = await file(p, join(out, label + "-" + name + ".md"));
      assert.match(md, /original critical claims left unchecked/i);
      assert.match(md, critical);
      assert.doesNotMatch(md, /^### .* · Disabling the feature flag reverses/m);
      assert.match(md, /public\/example-evidence\.html#flag-timeline/);
      const entries = md.split(/^### /m).slice(1);
      assert.equal(entries.length, name === "edited" ? 2 : 1);
      if (name === "edited") {
        const [first] = entries;
        assert.ok(first.startsWith("Unresolved · " + cpu));
        assert.doesNotMatch(first, /\*\*Evidence\*\*|flag-timeline/);
      }
      await button(p, "Choose another example").click();
    }
    return "Edited and deselected memos preserved scope and future-writes provenance; no evidence attached to the CPU claim.";
  },
);

test(
  31,
  "Clipboard matches downloaded memo",
  "Grant clipboard permissions only in the isolated local browser context, run CI, click Copy Markdown, observe feedback and compare clipboard text with a downloaded export.",
  "Clipboard copy announces completion and matches the downloaded memo.",
  async ({ p, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin,
    });
    await review(p, "ci");
    await button(p, "Copy Markdown").click();
    await check(p.getByRole("status")).toContainText(/copied/i);
    const copied = await p.evaluate(() => navigator.clipboard.readText());
    const saved = await file(p, undefined, false);
    assert.equal(copied.replace(/\r\n/g, "\n"), saved.replace(/\r\n/g, "\n"));
    return (
      "Copied feedback appeared; clipboard and downloaded memo " +
      (copied === saved
        ? "matched exactly."
        : "matched after Windows newline normalization.")
    );
  },
);

test(
  32,
  "Repeated downloads",
  "Download the same flag result three times, choose replica and export that result twice.",
  "Repeated files are deterministic within a scenario; each new scenario has its own content.",
  async ({ p }) => {
    await review(p);
    const original = await file(p);
    assert.equal(await file(p), original);
    assert.equal(await file(p), original);
    await button(p, "Choose another example").click();
    await p.getByRole("link", { name: scenarios.replica.link }).click();
    await edit(p);
    await run(p);
    const replica = await file(p);
    assert.equal(await file(p), replica);
    assert.notEqual(replica, original);
    assert.match(replica, /#replica-timeline/);
    return "Three flag downloads agreed and two replica downloads agreed; the new report replaced the old content.";
  },
);

async function freezeRun(p) {
  await p.clock.install();
  await p.clock.pauseAt(new Date(Date.now() + 1200));
  await button(p, "Run checks").click();
  await check(heading(p, /Checking your assumptions/)).toBeVisible();
}

test(
  33,
  "Refresh every stage",
  "Refresh after loading flag Plan, after editing Assumptions, while Running is visibly paused with the browser clock, then after Results.",
  "Restore plan/draft/results where applicable and offer a usable recovery after running is interrupted.",
  async ({ p }) => {
    await go(p);
    await p.reload();
    await check(button(p, "Review example")).toBeVisible();
    await edit(p);
    await field(p, 1).fill(cpu);
    await p.reload();
    await check(field(p, 1)).toHaveValue(cpu);
    await freezeRun(p);
    await p.reload();
    await p.clock.resume();
    const next = await stage(p).innerText();
    if (/Assumptions/.test(next)) {
      await check(field(p, 1)).toHaveValue(cpu);
      await run(p);
    } else {
      await result(p);
    }
    await unsupported(p, cpu);
    await p.reload();
    await result(p);
    await unsupported(p, cpu);
    return (
      "Plan, edited draft and result survived reload; active run recovered at " +
      next.replace(/\s+/g, " ") +
      "."
    );
  },
);

test(
  34,
  "Tabs and scenario isolation",
  "Open flag and replica as separate tabs in one context, enter distinct drafts, run concurrently, reload both, and compare reports.",
  "Each tab keeps its own scenario, draft and findings.",
  async ({ p, context }) => {
    const other = await context.newPage();
    await Promise.all([go(p), go(other, "replica")]);
    await Promise.all([edit(p), edit(other)]);
    await Promise.all([field(p, 1).fill(cpu), field(other, 1).fill(downtime)]);
    await Promise.all([run(p), run(other)]);
    await Promise.all([p.reload(), other.reload()]);
    await unsupported(p, cpu);
    await unsupported(other, downtime);
    await check(card(p, downtime)).toHaveCount(0);
    await check(card(other, cpu)).toHaveCount(0);
    await other.close();
    return "Distinct drafts and reports stayed isolated in two tabs, including after reload.";
  },
);

test(
  35,
  "Repeated reviews",
  "Run flag defaults three times, using Edit assumptions between runs and exporting each result.",
  "Stable verdicts, no duplicate cards, stale progress or changed memo.",
  async ({ p }) => {
    await review(p);
    const initial = await file(p);
    for (let i = 0; i < 2; i += 1) {
      await button(p, "Edit assumptions").click();
      await run(p);
      await baseline(p, "flag");
      assert.equal(await file(p), initial);
    }
    return "Three review runs produced identical two-card reports and memo downloads.";
  },
);

test(
  36,
  "Rapid action clicks",
  "Use browser double-clicks on Run, Edit, Export and example navigation, and inspect the final report, download content and draft stage.",
  "Repeated activation stays recoverable with coherent findings and valid files.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await button(p, "Run checks").dblclick();
    await result(p);
    await baseline(p, "flag");
    await button(p, "Edit assumptions").dblclick();
    await check(heading(p, "Review assumptions")).toBeVisible();
    await run(p);
    const downloads = [];
    p.on("download", (d) => downloads.push(d));
    const exporting = p.waitForEvent("download", { timeout: 3000 });
    await button(p, "Export Markdown").dblclick();
    const first = await exporting;
    assert.match(await readFile(await first.path(), "utf8"), /flag-timeline/);
    const exportCount = downloads.length;
    await button(p, "Choose another example").dblclick();
    const next = await stage(p).innerText();
    assert.match(
      next,
      /Plan/,
      "Double-clicking Choose another example left the workflow at " + next,
    );
    await p.getByRole("link", { name: scenarios.ci.link }).dblclick();
    await check(heading(p, scenarios.ci.title)).toBeVisible();
    await edit(p);
    await run(p);
    await baseline(p, "ci");
    assert.equal(
      exportCount,
      1,
      "Double-clicking Export Markdown saved " +
        exportCount +
        " copies of the same report.",
    );
    return "Rapid controls remained coherent and a single export was produced.";
  },
);

test(
  37,
  "Interrupt active review",
  "Edit flag, pause Running with the browser clock, use the visible cancel/back control if present or navigate to CI, return to flag and recover or rerun.",
  "A local user can recover without old results replacing the other scenario or losing an acknowledged saved draft.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    await field(p, 1).fill(cpu);
    await freezeRun(p);
    const cancel = button(p, /Cancel|Back to assumptions/);
    const usedCancel = (await cancel.count()) === 1;
    if (usedCancel) {
      await cancel.click();
      await check(field(p, 1)).toHaveValue(cpu);
    } else {
      await go(p, "ci");
      await check(heading(p, scenarios.ci.title)).toBeVisible();
      await go(p);
      await check(field(p, 1)).toHaveValue(cpu);
    }
    await p.clock.resume();
    await run(p);
    await unsupported(p, cpu);
    return (
      (usedCancel
        ? "Visible cancellation"
        : "Browser navigation away and back") +
      " restored the edited draft and let the user run it again."
    );
  },
);

test(
  38,
  "Browser goes offline",
  "Load the flag plan, take the context offline, run and download, try the bundled source, restore networking and reopen source.",
  "Loaded recorded review/download work or clearly show recovery; source responds after reconnection.",
  async ({ p, context }) => {
    await go(p);
    await context.setOffline(true);
    await edit(p);
    await run(p);
    await baseline(p, "flag");
    assert.match(await file(p), /flag-timeline/);
    const link = p.getByRole("link", { name: "Bundled flag timeline" }).first();
    const href = await link.getAttribute("href");
    const evidence = await context.newPage();
    const offline = await evidence.goto(new URL(href, origin).href).then(
      (r) => r.status(),
      (e) => e.message.match(/net::ERR_[A-Z_]+/)?.[0] ?? "navigation error",
    );
    await context.setOffline(false);
    const ok = await evidence.goto(new URL(href, origin).href);
    assert.equal(ok.status(), 200);
    await check(evidence.locator("#flag-timeline")).toBeVisible();
    return (
      "Loaded recorded review and export worked offline. Source navigation offline: " +
      offline +
      "; reconnected source HTTP 200."
    );
  },
);

test(
  39,
  "Session-storage restriction",
  "Block access to sessionStorage in a fresh context, navigate through Results, then reload and run again.",
  "Storage unavailability does not crash or block the anonymous recorded demo; password-free clean recovery works.",
  async ({ p, context, errors }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException(
            "QA browser restricts storage",
            "SecurityError",
          );
        },
      });
    });
    await review(p);
    await baseline(p, "flag");
    await p.reload();
    await check(button(p, "Review example")).toBeVisible();
    await edit(p);
    await run(p);
    assert.deepEqual(errors, []);
    return "Both reviews completed without JS errors; after reload, storage restriction returned the user to a usable Plan.";
  },
);

test(
  40,
  "Long reused session",
  "Use one tab for nine alternating CI, replica and flag reviews. Edit the first claim on alternate runs; choose another example after each result.",
  "Case changes preserve the correct proposal, findings and independent drafts with no page errors.",
  async ({ p, errors }) => {
    await go(p);
    for (let i = 0; i < 9; i += 1) {
      const id = ["ci", "replica", "flag"][i % 3];
      await p.getByRole("link", { name: scenarios[id].link }).click();
      await edit(p);
      const starting = await field(p, 1).inputValue();
      assert.ok(
        scenarios[id].claims[0].test(starting) || starting === cpu,
        "Unexpected starting claim after scenario change: " + starting,
      );
      if (i % 2) await field(p, 1).fill(cpu);
      const value = await field(p, 1).inputValue();
      await run(p);
      if (value === cpu) await unsupported(p, cpu);
      else await baseline(p, id);
      await verdict(p, scenarios[id].claims[1], scenarios[id].verdicts[1]);
      await button(p, "Choose another example").click();
    }
    assert.deepEqual(errors, []);
    return "Nine edited/default runs in one tab preserved scenario-specific claims and results without browser errors; heap growth was outside this check.";
  },
);

test(
  41,
  "Anonymous private boundaries",
  "Open /review and /settings as anonymous. Use the same browser context to request GET and empty JSON POST to /api/reviews on localhost.",
  "Private pages lead to sign-in and protected API does not start a live operation.",
  async ({ p }) => {
    for (const route of ["/review", "/settings"]) {
      await p.goto(origin + route, { waitUntil: "commit" });
      await check(heading(p, "Sign in to Tactile")).toBeVisible();
      assert.equal(new URL(p.url()).pathname, "/login");
      assert.equal(new URL(p.url()).searchParams.get("next"), route);
    }
    const results = [];
    for (const method of ["GET", "POST"]) {
      const response = await p.request.fetch(origin + "/api/reviews", {
        method,
        ...(method === "POST" ? { data: {} } : {}),
      });
      assert.ok([401, 403, 404, 405, 503].includes(response.status()));
      const body = await response.json();
      assert.match(
        body.message,
        /review|route|configur|sign in|authoriz|provider|method/i,
      );
      results.push(method + " " + response.status() + " " + body.message);
    }
    return (
      "Both pages redirected to sign-in; /api/reviews " +
      results.join("; ") +
      "."
    );
  },
);

test(
  42,
  "Inert text rendering",
  "Enter inert HTML-like text and a non-executable text/plain script marker through claim input; run and download.",
  "Tokens are shown as literal claim text, not DOM elements or Markdown HTML.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    const marker =
      '<b data-qa-inert="mark">literal</b> <script type="text/plain">QA marker only</script>';
    await field(p, 1).fill(marker);
    await run(p);
    const entry = await unsupported(p, /QA marker only/);
    assert.equal(
      await entry.getByRole("heading", { level: 3 }).textContent(),
      marker,
    );
    await check(
      p.locator('[data-qa-inert="mark"], script[type="text/plain"]'),
    ).toHaveCount(0);
    const md = await file(p);
    assert.doesNotMatch(md, /(?<!\\)<\/?(?:script|b)\b/i);
    assert.match(md, /QA marker only/);
    return "Literal inert markers survived in UI and memo; no corresponding DOM nodes or raw Markdown tags.";
  },
);

test(
  43,
  "Malformed evidence URLs",
  "Inspect Plan, Assumptions including Advanced settings, Results, and the anonymous workspace entry for an evidence URL entry control.",
  "Check public URL validation only if an anonymous evidence URL authoring control exists.",
  async ({ p }) => {
    await go(p);
    const hasUrlControl = async () =>
      p
        .locator(
          'input[type="url"], textarea[name*="url" i], input[placeholder*="https://" i]',
        )
        .count();
    const counts = [await hasUrlControl()];
    await edit(p);
    await detail(p, "Advanced settings").click();
    counts.push(await hasUrlControl());
    await run(p);
    counts.push(await hasUrlControl());
    await p.goto(origin + "/review", { waitUntil: "commit" });
    await check(heading(p, "Sign in to Tactile")).toBeVisible();
    assert.deepEqual(
      counts,
      [0, 0, 0],
      "An evidence URL control now exists; scope the case against its actual public UI.",
    );
    return stop(
      "No anonymous evidence URL editor at Plan, Advanced settings or Results; workspace requires sign-in. No external URL was submitted.",
    );
  },
);

test(
  44,
  "Public demo network isolation",
  "Observe browser traffic while running all selected examples, opening available review trails/room and downloading Markdown.",
  "Recorded workflow sends no live provider or protected review requests.",
  async ({ p, network, external }) => {
    for (const id of Object.keys(scenarios)) {
      await review(p, id);
      for (const summary of await detail(p, /Review trail/).all())
        await summary.click();
      await detail(p, "See the review room").click();
      await file(p);
    }
    const api = network.filter((r) => r.path.startsWith("/api/"));
    assert.deepEqual(
      api.map(({ method, path }) => method + " " + path),
      [],
      "Anonymous demo issued API requests.",
    );
    assert.deepEqual(
      external,
      [],
      "Unexpected external requests were attempted.",
    );
    return (
      network.length +
      " local browser requests observed; no attempted third-party traffic or app API traffic."
    );
  },
);

test(
  45,
  "Error privacy",
  "Request one normal unknown API path and an empty local live-review POST; visit the anonymous sign-in page, then trigger zero-selection validation.",
  "Errors are bounded explanations without credentials, exception dumps or filesystem paths.",
  async ({ p }) => {
    const messages = [];
    for (const [path, options] of [
      ["/api/qa-not-a-route", {}],
      ["/api/reviews", { method: "POST", data: {} }],
    ]) {
      const response = await p.request.fetch(origin + path, options);
      assert.ok(response.status() >= 400);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ["message"]);
      assert.ok(body.message.length < 180);
      assert.doesNotMatch(
        body.message,
        /(?:Bearer\s+\S+|sk-[\w-]{10,}|[A-Z]:\\|\/node_modules\/|\bat [\w.]+ \(|stack trace|Error:\s|eyJ[A-Za-z0-9_-]{12,})/i,
      );
      messages.push(response.status() + " " + body.message);
    }
    await p.goto(origin + "/settings", { waitUntil: "commit" });
    await check(heading(p, "Sign in to Tactile")).toBeVisible();
    await go(p);
    await edit(p);
    await include(p, 1).uncheck();
    await include(p, 2).uncheck();
    await check(p.getByText(/Include at least one assumption/)).toBeVisible();
    return (
      messages.join("; ") +
      "; login and form validation returned user-facing messages."
    );
  },
);

test(
  46,
  "Outbound navigation",
  "Inspect each GitHub link’s resolved destination, protocol, target and rel. Click in Chromium with external requests intercepted before transmission.",
  "Published links target only the displayed project/contributor locations and do not pass an opener to a new tab.",
  async ({ p, context, external }) => {
    await go(p);
    const expected = new Set([
      "/SammyRyuga/tactile",
      "/SammyRyuga",
      "/ryanfer123",
      "/aritraghosh2005",
    ]);
    const descriptions = [];
    const destinations = await p
      .getByRole("link")
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href) => href?.startsWith("https://")),
      );
    for (const href of destinations) {
      const targetPage = await context.newPage();
      await go(targetPage);
      const link = targetPage
        .getByRole("link")
        .and(targetPage.locator("a[href=" + JSON.stringify(href) + "]"));
      await check(link).toBeVisible();
      const url = new URL(href);
      assert.equal(url.origin, "https://github.com");
      assert.ok(expected.delete(url.pathname));
      const target = await link.getAttribute("target");
      const rel = await link.getAttribute("rel");
      if (target === "_blank") {
        assert.match(rel ?? "", /noopener|noreferrer/);
        const popup = context.waitForEvent("page", { timeout: 2200 });
        await link.click();
        const child = await popup;
        await child.waitForLoadState("domcontentloaded").catch(() => {});
        await child.close();
      } else {
        await link.click({ noWaitAfter: true });
      }
      await check
        .poll(() => external.includes(url.origin + url.pathname))
        .toBe(true);
      descriptions.push(url.pathname + " (" + (target ?? "same tab") + ")");
      await targetPage.close();
    }
    assert.equal(expected.size, 0);
    return (
      "Intercepted expected GitHub destinations " +
      descriptions.join(", ") +
      "; external redirect chains were outside local scope."
    );
  },
);

test(
  47,
  "Responsive workflows",
  "At 1440, 1280, 1024, 768, 390 and 320px in each theme, run Plan → Assumptions → Results, expand trail/room and inspect controls.",
  "Workflow stays reachable, layouts do not extend horizontally, and both report actions fit at every width.",
  async ({ p, out, label }) => {
    const failures = [];
    let viewed = 0;
    for (const theme of ["light", "dark"]) {
      await p.emulateMedia({ colorScheme: theme });
      for (const width of [1440, 1280, 1024, 768, 390, 320]) {
        await p.setViewportSize({ width, height: width > 500 ? 930 : 780 });
        try {
          await go(p);
          if (await button(p, "Choose another example").count())
            await button(p, "Choose another example").click();
          if (await button(p, "Back to plan").count())
            await button(p, "Back to plan").click();
          if (width > 800)
            await p.getByRole("link", { name: scenarios.ci.link }).click();
          const themeToggle = button(p, "Dark mode");
          const desired = String(theme === "dark");
          if ((await themeToggle.getAttribute("aria-pressed")) !== desired)
            await themeToggle.click();
          await check(themeToggle).toHaveAttribute("aria-pressed", desired);
          await layout(p, ["Review example"]);
          await edit(p);
          await layout(p, ["Add assumption", "Back to plan", "Run checks"]);
          await run(p);
          await detail(p, /Review trail/)
            .first()
            .click();
          await detail(p, "See the review room").click();
          await layout(p, [
            "Copy Markdown",
            "Export Markdown",
            "Edit assumptions",
            "Choose another example",
          ]);
          if (label.endsWith("-1") || width === 320)
            await p.screenshot({
              path: join(out, label + "-" + width + "-" + theme + ".png"),
              fullPage: true,
            });
          viewed += 1;
          await button(p, "Choose another example").click();
        } catch (error) {
          failures.push(
            width + " " + theme + ": " + error.message.split("\n")[0],
          );
          await p.screenshot({
            path: join(out, label + "-" + width + "-" + theme + "-failed.png"),
            fullPage: true,
          });
        }
      }
    }
    assert.deepEqual(failures, []);
    return (
      viewed +
      " viewport/theme workflows with no document overflow or offscreen report controls."
    );
  },
);

test(
  48,
  "Actual 200 percent browser zoom",
  "Use Chromium’s real per-tab 200% zoom, verify CSS width halves, then go through all steps and open a review trail.",
  "Main controls stay reachable and regression does not introduce document-level overflow.",
  async ({ p, zoom, out, label }) => {
    await go(p);
    const before = await p.evaluate(() => innerWidth);
    assert.equal(await zoom(p, 2), 2);
    await p.waitForFunction(
      (width) => Math.abs(innerWidth * 2 - width) <= 2,
      before,
    );
    await layout(p, ["Review example"]);
    await edit(p);
    await layout(p, ["Run checks", "Back to plan"]);
    await run(p);
    await detail(p, /Review trail/)
      .first()
      .click();
    const width = await layout(p, [
      "Copy Markdown",
      "Export Markdown",
      "Edit assumptions",
    ]);
    await p.screenshot({
      path: join(out, label + "-200-percent.png"),
      fullPage: true,
    });
    return (
      "Chrome tabs API reported 200%; window CSS width " +
      before +
      " → " +
      width +
      " and all steps/actions fit."
    );
  },
);

async function tabTo(p, target, key = "Tab") {
  for (let i = 0; i < 50; i += 1) {
    await p.keyboard.press(key);
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      const visible = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          element.matches(":focus-visible") &&
          (parseFloat(style.outlineWidth) > 0 || style.boxShadow !== "none")
        );
      });
      assert.ok(
        visible,
        "No visible focus indicator for " +
          (await target.evaluate(
            (e) => e.getAttribute("aria-label") || e.textContent.trim(),
          )),
      );
      return;
    }
  }
  assert.fail("Could not tab to " + target.toString());
}

test(
  49,
  "Keyboard-only workflow",
  "Use Tab and Shift+Tab to navigate, Enter to activate steps, Space to toggle an assumption and expand a review trail.",
  "Controls are reachable without a pointer and visible focus follows the chosen control.",
  async ({ p }) => {
    await go(p);
    await tabTo(p, button(p, "Review example"));
    await p.keyboard.press("Enter");
    await check(heading(p, "Review assumptions")).toBeVisible();
    await tabTo(p, include(p, 1));
    await p.keyboard.press("Space");
    await check(include(p, 1)).not.toBeChecked();
    await p.keyboard.press("Space");
    await check(include(p, 1)).toBeChecked();
    await tabTo(p, button(p, "Run checks"));
    await tabTo(p, button(p, "Back to plan"), "Shift+Tab");
    await tabTo(p, button(p, "Run checks"));
    await p.keyboard.press("Enter");
    await result(p);
    const trail = detail(p, /Review trail/).first();
    await tabTo(p, trail);
    await p.keyboard.press("Space");
    await check(
      trail.locator("..").getByRole("heading", { level: 4 }).first(),
    ).toBeVisible();
    await tabTo(p, button(p, "Export Markdown"), "Shift+Tab");
    return "Tab and Shift+Tab traversed controls; Enter and Space worked with visible focus on sampled workflow and disclosure controls.";
  },
);

async function contrast(sample) {
  return sample.evaluate((element) => {
    function rgb(input) {
      return input.match(/[\d.]+/g)?.map(Number) ?? [];
    }
    function luminance(color) {
      const values = color.slice(0, 3).map((channel) => {
        const fraction = channel / 255;
        return fraction <= 0.04045
          ? fraction / 12.92
          : ((fraction + 0.055) / 1.055) ** 2.4;
      });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    }
    const stack = [];
    for (let current = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.backgroundImage !== "none") return null;
      const color = rgb(style.backgroundColor);
      if (color.length >= 3) stack.push(color);
      if ((color[3] ?? 1) === 1 && color.length >= 3) break;
    }
    const background = stack.reverse().reduce(
      (below, next) => {
        const alpha = next[3] ?? 1;
        return below.map(
          (channel, i) => channel * (1 - alpha) + next[i] * alpha,
        );
      },
      [255, 255, 255],
    );
    const foreground = rgb(getComputedStyle(element).color);
    const alpha = foreground[3] ?? 1;
    const rendered = background.map(
      (channel, i) => channel * (1 - alpha) + foreground[i] * alpha,
    );
    const values = [luminance(background), luminance(rendered)].sort(
      (a, b) => b - a,
    );
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
}

test(
  50,
  "Themes and contrast",
  "Toggle theme twice at each workflow stage; compare actual color and visible control/step/verdict contrast. Set dark, reload, verify persistence.",
  "Theme switch works throughout and persists; sampled control/status text reaches 4.5:1 on solid backgrounds.",
  async ({ p }) => {
    await go(p);
    const observations = [];
    for (const [step, name] of [
      ["plan", "Review example"],
      ["assumptions", "Run checks"],
      ["results", "Copy Markdown"],
    ]) {
      if (step === "assumptions") await edit(p);
      if (step === "results") await run(p);
      for (let i = 0; i < 2; i += 1) {
        const before = await appearances(p);
        await button(p, /^(Dark|Light) mode$/).click();
        await check.poll(() => appearances(p)).not.toEqual(before);
        const theme =
          (await button(p, "Dark mode").getAttribute("aria-pressed")) === "true"
            ? "dark"
            : "light";
        const samples = [[name, button(p, name)]];
        if (step === "results")
          samples.push(
            ["Contradicted", exact(cards(p), "Contradicted")],
            ["Supported", exact(cards(p), "Supported")],
          );
        for (const [label, sample] of samples) {
          const ratio = await contrast(sample);
          observations.push({
            label,
            theme,
            ratio: ratio?.toFixed(2) ?? "gradient",
          });
        }
      }
    }
    const dark = button(p, "Dark mode");
    if ((await dark.getAttribute("aria-pressed")) !== "true")
      await dark.click();
    await check(dark).toHaveAttribute("aria-pressed", "true");
    await p.reload();
    await result(p);
    await check(dark).toHaveAttribute("aria-pressed", "true");
    const inadequate = observations.filter(
      ({ ratio }) => ratio !== "gradient" && Number(ratio) < 4.5,
    );
    assert.deepEqual(inadequate, [], "Sampled text contrast below 4.5:1");
    return (
      "Theme changed and persisted; solid-background text ratios or unmeasured gradient samples: " +
      observations
        .map(
          ({ label, theme, ratio }) =>
            label + " (" + theme + ", " + ratio + ")",
        )
        .join(", ") +
      "."
    );
  },
);

test(
  51,
  "Reduced motion",
  "Enable the OS reduced-motion preference in Chromium, open all workflow steps and a review trail/room station.",
  "Preference is active; progress, recommendation, evidence and station details remain available.",
  async ({ p }) => {
    await p.emulateMedia({ reducedMotion: "reduce" });
    await go(p);
    assert.equal(
      await p.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      true,
    );
    await edit(p);
    await run(p);
    await baseline(p, "flag");
    await detail(p, /Review trail/)
      .first()
      .click();
    await check(
      p.getByRole("heading", { name: /Feasibility/ }).first(),
    ).toBeVisible();
    await detail(p, "See the review room").click();
    await button(p, /Decision memo/).click();
    await check(heading(p, "Decision memo")).toBeVisible();
    return "Active reduced-motion preference did not prevent primary workflow, trail, or memo-station access.";
  },
);

test(
  52,
  "Accessible labels, focus and status",
  "Check semantic controls and active focus after stage changes; deselect all, inspect the live region and run a valid review to check explicit verdict labels.",
  "Important transitions move focus to meaningful content and the zero-selection explanation is programmatically announced.",
  async ({ p }) => {
    await go(p);
    await edit(p);
    const focus = async () =>
      p.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active.tagName,
          heading: /^H[1-6]$/.test(active.tagName),
          text:
            active === document.body
              ? "body"
              : active.textContent.trim().slice(0, 70),
        };
      });
    const afterEdit = await focus();
    await check(field(p, 1)).toBeVisible();
    await check(include(p, 1)).toBeChecked();
    await include(p, 1).uncheck();
    await include(p, 2).uncheck();
    const explanation = p.getByText(/Include at least one assumption/);
    await check(explanation).toBeVisible();
    const runChecks = button(p, "Run checks");
    await check(runChecks).toBeDisabled();
    await check(runChecks).toHaveAccessibleDescription(
      "Include at least one assumption to run checks.",
    );
    await check(p.getByRole("status")).toContainText(
      /0 of 2 selected[.\s]+Select at least one assumption to run checks\./,
    );
    await include(p, 1).check();
    await check(runChecks).toBeEnabled();
    await check(runChecks).not.toHaveAttribute("aria-describedby");
    await check(p.getByRole("status")).not.toContainText("Select at least one");
    await run(p);
    const afterResults = await focus();
    await verdict(p, scenarios.flag.claims[0], "Contradicted");
    assert.ok(afterEdit.heading && afterResults.heading);
    return "Stage headings received focus, the zero-selection status and disabled button provided actionable guidance, and guidance cleared when reselected.";
  },
);

test(
  53,
  "Narrow results controls",
  "Set 320px, run flag, inspect the recommendation and every claim, expand evidence drawers, copy with real clipboard and export.",
  "Readable cards, no sideways scrolling, and working disclosure, clipboard and Download at 320px.",
  async ({ p, context, out, label }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin,
    });
    await p.setViewportSize({ width: 320, height: 780 });
    await review(p);
    await baseline(p, "flag");
    for (const summary of await detail(p, /Review trail/).all())
      await summary.click();
    await detail(p, "Read your plan").click();
    await layout(p, ["Copy Markdown", "Export Markdown"]);
    await button(p, "Copy Markdown").click();
    await check(p.getByRole("status")).toContainText(/copied/i);
    const md = await file(p);
    assert.match(md, /flag-timeline/);
    await p.screenshot({
      path: join(out, label + "-320-results.png"),
      fullPage: true,
    });
    return "Recommendation, verdicts, expanded drawers, clipboard and file download worked without page-wide scrolling at 320px.";
  },
);

export { cases };
