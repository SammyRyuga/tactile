import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("the public demo replays all three cases and exports the recorded memo", async ({
  page,
  context,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const unexpectedRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const homepageAuthConfig =
      url.pathname === "/api/auth-config" &&
      new URL(page.url()).pathname === "/";
    if (
      url.origin !== origin ||
      (url.pathname.startsWith("/api/") && !homepageAuthConfig) ||
      url.pathname.startsWith("/auth/")
    ) {
      unexpectedRequests.push(url.href);
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Data consistency" }).press("Space");
  await page.getByRole("link", { name: "Try this example" }).press("Enter");
  await expect(page).toHaveURL(/\/demo\?example=replica$/);
  await expect(
    page.getByRole("heading", { name: "Public demo" }),
  ).toBeVisible();
  await expect(page.getByLabel("Bundled plan")).toHaveValue(
    /asynchronous database replica/,
  );

  const report = page.locator(".report");
  async function runRecordedCase() {
    await page.getByRole("button", { name: "Inspect claims" }).press("Enter");
    await expect(
      page.getByRole("heading", { name: "Choose what to check" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Run review" }).press("Enter");
    await expect(
      report.getByRole("heading", { name: "Decision report" }),
    ).toBeFocused();
    await expect(report.getByText("Bundled example evidence")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await runRecordedCase();
  await expect(report.getByText("Unresolved", { exact: true })).toBeVisible();
  await expect(
    report.getByRole("link", { name: "Bundled replica timeline" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Choose another example" }).click();
  await page.getByRole("link", { name: /CI coverage/ }).click();
  await expect(page.getByLabel("Bundled plan")).toHaveValue(
    /changed-package tests/,
  );
  await runRecordedCase();
  await expect(report.getByText("Weakened", { exact: true })).toBeVisible();
  await expect(
    report.getByRole("link", { name: "Bundled dependency replay" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Choose another example" }).click();
  await page.getByRole("link", { name: /Rollout safety/ }).click();
  await expect(page.getByLabel("Bundled plan")).toHaveValue(
    /new record writer/,
  );
  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await runRecordedCase();
  const rollback = report
    .getByRole("article")
    .filter({ hasText: "reverses records" });
  await expect(
    rollback.getByText("Contradicted", { exact: true }),
  ).toBeVisible();
  await expect(report.getByText("Supported", { exact: true })).toBeVisible();
  const trail = rollback.getByText("Review trail");
  await expect(trail).toHaveText("Review trail (1 check)");
  await trail.press("Enter");
  await expect(
    rollback.getByText("Flag evaluation has no write path", { exact: false }),
  ).toBeVisible();
  const popup = page.waitForEvent("popup");
  await rollback
    .getByRole("list", { name: "Cited evidence" })
    .getByRole("link", { name: "Bundled flag timeline" })
    .click();
  const evidence = await popup;
  await expect(
    evidence.getByRole("heading", { name: "Feature flag timeline" }),
  ).toBeVisible();
  await evidence.close();

  const download = page.waitForEvent("download");
  await report.getByRole("button", { name: "Export Markdown" }).click();
  const memo = await readFile(await (await download).path(), "utf8");
  expect(memo).toContain("Mode: Bundled example");
  expect(memo).toContain(origin + "/example-evidence.html#flag-timeline");
  expect(memo).toContain("Contradicted");
  expect(memo).toContain("Supported");
  await page.reload();
  await expect(
    report.getByRole("heading", { name: "Decision report" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit claims" }).click();
  const edited =
    "Every old record returns within one second of switching off the flag.";
  await page.getByRole("textbox", { name: "Claim 1" }).fill(edited);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Claim 1" })).toHaveValue(
    edited,
  );
  await page.getByRole("button", { name: "Run review" }).click();
  const editedFinding = report.getByRole("article").filter({ hasText: edited });
  await expect(
    editedFinding.getByText("Unresolved", { exact: true }),
  ).toBeVisible();
  await expect(
    editedFinding.getByText(/bundled evidence does not cover/),
  ).toBeVisible();
  await expect(editedFinding.getByRole("link")).toHaveCount(0);
  expect(unexpectedRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("invalid demo cases can recover and anonymous settings stay protected", async ({
  page,
  request,
}) => {
  const invalid = await page.goto("/does-not-exist");
  expect(invalid?.status()).toBe(404);
  await page.goto("/demo?example=missing");
  await expect(
    page.getByRole("heading", { name: "Demo case unavailable" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Rollout safety" }).click();
  await expect(page.getByLabel("Bundled plan")).toHaveValue(/feature flag/);

  const health = await request.get("/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ ok: true });
  const settings = await request.get("/api/settings/provider");
  expect(settings.status()).toBe(401);
  expect(settings.headers()["cache-control"]).toBe("no-store");
  expect(settings.headers()["x-content-type-options"]).toBe("nosniff");
});
