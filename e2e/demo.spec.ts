import { expect, test } from "@playwright/test";

test("guest reviews a demo, explores its trail, exports, and restores the report", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Decisions, under load." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Try the demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm the claims" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run review" }).click();
  await expect(
    page.getByRole("heading", { name: "Decision report" }),
  ).toBeVisible();
  await expect(page.getByText("Smallest viable change").first()).toBeVisible();
  const finding = page
    .getByRole("article")
    .filter({ hasText: "Testing only the changed package" });
  await finding.getByText("Review trail").click();
  await expect(
    finding.getByText(
      "The consumer imports the changed public schema contract.",
    ),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("tactile-review.md");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Decision report" }),
  ).toBeVisible();
});

test("the case selector opens the corresponding bundled review", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Data consistency" }).click();
  await expect(
    page.getByRole("heading", { name: "Move checkout reads to a replica" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Run this case" }).click();
  await expect(page).toHaveURL(/example=replica/);
  await expect(page.getByRole("textbox", { name: "Claim 1" })).toHaveValue(
    /A replica always returns an order/,
  );
  await page.getByRole("button", { name: "Run review" }).click();
  await expect(
    page.getByRole("heading", { name: "Decision report" }),
  ).toBeVisible();
  await expect(
    page.getByText("Keep immediate order lookups on the primary", {
      exact: false,
    }),
  ).toBeVisible();
});
