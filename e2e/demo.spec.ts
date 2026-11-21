import { expect, test } from "@playwright/test";
import { mockAuthentication, signIn } from "./auth-fixture.ts";

test("signed-in user reviews an example, exports, and restores the report", async ({
  page,
}) => {
  await mockAuthentication(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Decisions, under load." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Sign in to workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(page);
  await expect(page).toHaveURL(/\/review$/);
  await expect(
    page.getByRole("heading", { name: "Describe your decision" }),
  ).toBeVisible();
  await expect(page.getByLabel("Engineering proposal")).toHaveValue("");
  await page.getByRole("link", { name: /CI coverage/ }).click();
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
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy Markdown" }).click();
  await expect(page.getByRole("status")).toHaveText("Report copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Tactile decision review",
  );
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
  await page.goto("/review");
  await page
    .getByLabel("Engineering proposal")
    .fill("A separate draft decision to preserve.");
  const history = page.getByRole("region", { name: "Recent reports" });
  await expect(history).toBeVisible();
  await history.getByRole("button", { name: /Replace full test runs/ }).click();
  await expect(
    page.getByRole("heading", { name: "Decision report" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(page.getByLabel("Engineering proposal")).toHaveValue(
    "A separate draft decision to preserve.",
  );
});

test("the case selector opens the corresponding bundled review", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAuthentication(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Data consistency" }).click();
  await expect(
    page.getByRole("heading", { name: "Move checkout reads to a replica" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in to run this case" }).click();
  await signIn(page);
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

test("claim controls preserve the selection limit and keyboard editing", async ({
  page,
}) => {
  await mockAuthentication(page);
  await page.goto("/review?demo=1");
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(page);
  const first = page.getByRole("checkbox", { name: "Review claim 1" });
  const fourth = page.getByRole("checkbox", { name: "Review claim 4" });
  await expect(fourth).toBeDisabled();
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).not.toBeChecked();
  await expect(page.getByRole("status")).toContainText("2 of 3");
  await fourth.check();
  await expect(page.getByRole("status")).toContainText("3 of 3");
  await page.getByRole("button", { name: "Add claim" }).click();
  const added = page.getByRole("textbox", { name: "Claim 5" });
  await expect(added).toBeFocused();
  await added.fill("The pilot covers all supported clients.");
  await page.getByRole("button", { name: "Remove claim 5" }).click();
  await expect(added).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Claim 4" })).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("settings require sign-in and store the appearance preference across reloads", async ({
  page,
}) => {
  await mockAuthentication(page);
  let saved = false;
  await page.route("**/api/settings/provider", (route) => {
    const method = route.request().method();
    if (method === "POST") saved = true;
    if (method === "DELETE") saved = false;
    return route.fulfill({ json: { saved } });
  });
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.locator("main").getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByLabel("API key", { exact: true })
    .fill("synthetic-fixture-key");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Key saved for this session.",
  );
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Key saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("No key saved", { exact: true })).toBeVisible();
});
