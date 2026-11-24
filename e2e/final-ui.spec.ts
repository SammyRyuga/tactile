import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const examples = [
  ["CI coverage", "ci"],
  ["Data consistency", "replica"],
  ["Rollout safety", "flag"],
] as const;
const credits = [
  ["Ryan Fernandes", "ryanfer123"],
  ["Samanyu Pattanayak", "SammyRyuga"],
  ["Aritra Ghosh", "aritraghosh2005"],
] as const;

async function verifyCredits(page: Page) {
  const footer = page.locator("footer");
  await expect(footer).toContainText(
    "Built by Ryan Fernandes, Samanyu Pattanayak and Aritra Ghosh",
  );
  const names = await footer.locator("span a").allTextContents();
  expect(names).toEqual(credits.map(([name]) => name));
  for (const [name, handle] of credits)
    await expect(footer.getByRole("link", { name })).toHaveAttribute(
      "href",
      "https://github.com/" + handle,
    );
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page
      .evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      .then(({ width, scroll }) => scroll - width),
  ).toBeLessThanOrEqual(1);
}

async function verifySteps(page: Page) {
  const measured = await page
    .locator(".method-steps li")
    .evaluateAll((items) => {
      function luminance(color: string) {
        const [red, green, blue] = color
          .match(/\d+/g)!
          .slice(0, 3)
          .map((raw) => {
            const channel = Number(raw) / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          });
        return red * 0.2126 + green * 0.7152 + blue * 0.0722;
      }
      return items.map((item) => {
        const number = getComputedStyle(item, "::before");
        const light = luminance(number.color);
        const dark = luminance(number.backgroundColor);
        return {
          contrast:
            (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
          center: number.placeItems,
          radius: number.borderRadius,
          counter: number.content,
          card: getComputedStyle(item).backgroundColor,
        };
      });
    });
  expect(measured).toHaveLength(3);
  expect(new Set(measured.map(({ card }) => card)).size).toBe(3);
  for (const number of measured) {
    expect(number.contrast).toBeGreaterThanOrEqual(4.5);
    expect(number.center).toBe("center");
    expect(number.radius).toBe("100%");
    expect(number.counter).toBe("counter(method)");
  }
}

async function renderedFootprint(page: Page) {
  return page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector)!;
      const { height, y } = element.getBoundingClientRect();
      return [height, y + scrollY];
    };
    return [
      ...bounds(".case-board"),
      ...bounds(".case-pair:not([inert]) .case-proposal"),
      ...bounds(".case-pair:not([inert]) .case-finding"),
      ...bounds(".case-pair:not([inert]) .home-button"),
      ...bounds("#method"),
      ...bounds("#faq"),
      ...bounds("footer"),
    ];
  });
}

async function verifyDisclosures(page: Page) {
  const plan = page.locator("summary").filter({ hasText: "Read your plan" });
  const room = page.locator("summary").filter({ hasText: "Review activity" });
  const gaps = () =>
    page.evaluate(() => {
      const cards = document.querySelectorAll(".finding");
      const last = cards[cards.length - 1].getBoundingClientRect();
      const [first, second] = Array.from(
        document.querySelectorAll(".report-details > details"),
      );
      const firstBox = first.getBoundingClientRect();
      const secondBox = second.getBoundingClientRect();
      return [firstBox.top - last.bottom, secondBox.top - firstBox.bottom];
    });
  for (const [planOpen, roomOpen] of [
    [false, false],
    [true, false],
    [true, true],
    [false, true],
  ]) {
    for (const [summary, open] of [
      [plan, planOpen],
      [room, roomOpen],
    ] as const) {
      const details = summary.locator("..");
      if (
        (await details.evaluate((el) => (el as HTMLDetailsElement).open)) !==
        open
      )
        await summary.press("Enter");
      expect(
        await details.evaluate((el) => (el as HTMLDetailsElement).open),
      ).toBe(open);
    }
    for (const gap of await gaps()) expect(gap).toBeGreaterThanOrEqual(7);
    await noHorizontalOverflow(page);
  }
  await expect(plan).toBeFocused();
  expect(await plan.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  expect(
    await plan.evaluate((el) => getComputedStyle(el).outlineStyle),
  ).not.toBe("none");
}

for (const width of [1440, 1280, 1024, 768, 390, 320]) {
  test(
    "VIS-01–08 · homepage and demo stay usable at " +
      width +
      "px in both themes",
    async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: width < 500 ? 800 : 960 });
      await page.clock.install();
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await page.goto("/");
        await page.evaluate(() => document.fonts.ready);
        await expect(
          page.getByRole("button", { name: "Dark mode" }),
        ).toHaveAttribute("aria-pressed", String(theme === "dark"));
        await verifySteps(page);
        await verifyCredits(page);
        const before = await renderedFootprint(page);
        for (const [label, id] of [...examples, ...examples]) {
          await page.getByRole("button", { name: label, exact: true }).click();
          const callToAction = page.getByRole("link", {
            name: "Try this example",
          });
          await expect(callToAction).toBeVisible();
          await expect(callToAction).toHaveAttribute(
            "href",
            "/demo?example=" + id,
          );
          const after = await renderedFootprint(page);
          for (const [index, value] of after.entries())
            expect(
              Math.abs(value - before[index]),
              "layout measurement " + index,
            ).toBeLessThanOrEqual(1);
          await noHorizontalOverflow(page);
        }

        await page.getByRole("link", { name: "Try this example" }).click();
        await verifyCredits(page);
        await noHorizontalOverflow(page);
        await page.getByRole("button", { name: "Review example" }).click();
        await page
          .locator("summary")
          .filter({ hasText: "Advanced settings" })
          .press("Enter");
        await noHorizontalOverflow(page);
        await page.clock.pauseAt(
          new Date((await page.evaluate(() => Date.now())) + 1200),
        );
        await page.getByRole("button", { name: "Run checks" }).click();
        await expect(
          page.getByRole("heading", { name: "Checking your assumptions" }),
        ).toBeVisible();
        await noHorizontalOverflow(page);
        await page.clock.resume();
        await expect(
          page.getByRole("heading", { name: "Review results" }),
        ).toBeVisible();
        await verifyDisclosures(page);
        await page
          .locator("summary")
          .filter({ hasText: /Review trail/ })
          .first()
          .press("Enter");
        await expect(
          page.getByRole("heading", { name: /Feasibility/ }).first(),
        ).toBeVisible();
        await noHorizontalOverflow(page);
        await verifyCredits(page);

        await page
          .getByRole("button", { name: "Choose another example" })
          .click();
        for (const route of ["/login", "/settings"]) {
          await page.goto(route);
          await expect(
            page.getByRole("heading", { name: "Sign in to Tactile" }),
          ).toBeVisible();
          await noHorizontalOverflow(page);
        }
      }
    },
  );
}

test("reused tab preserves step history, accessible zero-selection instructions and deliberate exports", async ({
  page,
}) => {
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.goto("/demo?example=flag");
  await page.getByRole("button", { name: "Review example" }).press("Enter");
  await page.getByRole("button", { name: "Run checks" }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose another example" })
    .press("Enter");
  await page.getByRole("link", { name: /^CI coverage/ }).press("Enter");
  await page.getByRole("button", { name: "Review example" }).press("Enter");
  const claim = page.getByRole("textbox", {
    name: "Assumption 1",
    exact: true,
  });
  const selection = page.getByRole("checkbox", { name: /^Include assumption/ });
  const critical = page.getByRole("checkbox", {
    name: "Critical assumption 1",
  });
  const run = page.getByRole("button", { name: "Run checks" });
  await claim.fill(
    "A synthetic QA proposal retains every historical artifact.",
  );
  if (!(await critical.isChecked())) await critical.press("Space");
  for (const field of await selection.all())
    if (await field.isChecked()) await field.press("Space");
  await expect(run).toBeDisabled();
  await expect(run).toHaveAccessibleDescription(
    "Include at least one assumption to run checks.",
  );
  await expect(page.getByRole("status")).toContainText(
    /0 of 4 selected.*Select at least one/,
  );
  await selection.first().press("Space");
  await expect(run).toBeEnabled();
  await expect(page.getByRole("status")).not.toContainText(
    "Select at least one",
  );
  await run.press("Enter");

  const exportButton = page.getByRole("button", { name: "Export Markdown" });
  await expect(exportButton).toBeVisible();
  const firstDownload = page.waitForEvent("download");
  await exportButton.dblclick();
  const first = await firstDownload;
  await expect.poll(() => downloads.length).toBe(1);
  expect(await readFile(await first.path(), "utf8")).toContain(
    "retains every historical artifact",
  );
  const secondDownload = page.waitForEvent("download");
  await exportButton.press("Enter");
  expect((await secondDownload).suggestedFilename()).toBe("tactile-review.md");
  expect(downloads).toHaveLength(2);
  await expect(
    page.getByRole("button", { name: "Copy Markdown" }),
  ).toBeEnabled();

  await page.goBack();
  await expect(claim).toHaveValue(/retains every historical artifact/);
  await expect(selection.first()).toBeChecked();
  await expect(selection.nth(1)).not.toBeChecked();
  await expect(critical).toBeChecked();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Run fewer tests per pull request" }),
  ).toBeVisible();
  await page.goForward();
  await expect(claim).toHaveValue(/retains every historical artifact/);
  await page.goForward();
  await expect(exportButton).toBeVisible();
  await page.reload();
  await expect(exportButton).toBeVisible();
  await page.getByRole("button", { name: "Edit assumptions" }).press("Enter");
  await claim.fill("A second QA review uses another edited claim.");
  await run.press("Enter");
  const latest = page.waitForEvent("download");
  await exportButton.press("Enter");
  expect(await readFile(await (await latest).path(), "utf8")).toContain(
    "another edited claim",
  );
});
