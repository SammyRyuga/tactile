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
  const exampleLink = page.getByRole("link", { name: "Try this example" });
  await expect(exampleLink).toHaveAttribute("href", "/demo?example=replica");
  await exampleLink.press("Enter");
  await expect(page).toHaveURL(/\/demo\?example=replica$/);
  await expect(
    page.getByRole("heading", { name: "Public demo" }),
  ).toBeVisible();
  await expect(page.getByLabel("Bundled plan")).toHaveValue(
    /asynchronous database replica/,
  );

  const report = page.locator(".report");
  async function runRecordedCase() {
    await page.getByRole("button", { name: "Review example" }).press("Enter");
    await expect(
      page.getByRole("heading", { name: "Review assumptions" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Run checks" }).press("Enter");
    await expect(
      report.getByRole("heading", { name: "Review results" }),
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
    .filter({ hasText: "reverses changes the new writer" });
  const original = await rollback.getByRole("heading").first().innerText();
  await expect(
    report.getByRole("button", { name: "Copy Markdown" }),
  ).toHaveText("Copy Markdown");
  expect(
    await report.locator(".findings").evaluate((findings) => {
      const disclosures =
        findings.parentElement!.querySelector(".report-details")!;
      return Boolean(
        findings.compareDocumentPosition(disclosures) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }),
  ).toBe(true);
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
  expect(memo).toContain(
    "Recorded fixture excerpt from Tactile's bundled evidence",
  );
  expect(memo).toContain(
    "Read 7    the update from request A is still present",
  );
  if (["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname))
    expect(memo).not.toContain(origin);
  else expect(memo).toContain(origin + "/example-evidence.html#flag-timeline");
  expect(memo).toContain("Contradicted");
  expect(memo).toContain("Supported");
  await page.reload();
  await expect(
    report.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit assumptions" }).click();
  const edited = "The service reduces first-month hosting costs by 30 percent.";
  await page.getByRole("textbox", { name: "Assumption 1" }).fill(edited);
  await page.getByText("Advanced settings", { exact: true }).press("Enter");
  await page
    .getByRole("combobox", { name: "Main risk for assumption 1" })
    .selectOption("evidence");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Assumption 1" })).toHaveValue(
    edited,
  );
  await page.getByRole("button", { name: "Run checks" }).click();
  const editedFinding = report.getByRole("article").filter({ hasText: edited });
  await expect(
    editedFinding.getByText("Unresolved", { exact: true }),
  ).toBeVisible();
  await expect(
    editedFinding.getByText(/bundled evidence does not cover/),
  ).toBeVisible();
  await expect(
    editedFinding.getByText(/time window named in this claim/),
  ).toBeVisible();
  await expect(editedFinding.getByRole("link")).toHaveCount(0);
  const coverage = report.getByRole("region", { name: "Claim coverage" });
  await expect(
    coverage.getByText("Original critical claims left unchecked"),
  ).toBeVisible();
  await expect(coverage.getByText(original, { exact: true })).toBeVisible();
  await expect(rollback).toHaveCount(0);
  const editedDownload = page.waitForEvent("download");
  await report.getByRole("button", { name: "Export Markdown" }).click();
  const editedMemo = await readFile(
    await (await editedDownload).path(),
    "utf8",
  );
  expect(editedMemo).toContain("- " + original);
  expect(editedMemo).toContain("### Unresolved · " + edited);
  expect(editedMemo).not.toContain("### Contradicted");
  const editedSection = editedMemo.slice(
    editedMemo.indexOf("### Unresolved"),
    editedMemo.indexOf("### Supported"),
  );
  expect(editedSection).not.toContain("Bundled flag timeline");
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

test("the beginner flow keeps advanced controls optional and restores the chosen example on Back", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  if (testInfo.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 840 });
  await page.goto("/demo?example=flag");
  const activeStep = page.locator(".steps [aria-current=step]");
  await expect(activeStep).toContainText("Plan");
  await page.getByRole("button", { name: "Review example" }).press("Enter");
  await expect(activeStep).toContainText("Assumptions");
  await expect(
    page.getByRole("checkbox", { name: "Critical assumption 1" }),
  ).toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Main risk for assumption 1" }),
  ).toBeHidden();
  await page.getByRole("checkbox", { name: "Include assumption 1" }).uncheck();
  await page.getByRole("checkbox", { name: "Include assumption 2" }).uncheck();
  const run = page.getByRole("button", { name: "Run checks" });
  await expect(run).toBeDisabled();
  await expect(
    page.getByText("Include at least one assumption to run checks."),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Include assumption 1" }).check();
  const long =
    "Every affected record must be restored after switching the feature off, including records written by requests already running when the flag changed.";
  await page.getByRole("textbox", { name: "Assumption 1" }).fill(long);
  await run.press("Enter");
  await expect(activeStep).toContainText("Results");
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeFocused();
  await expect(
    page.getByRole("article").getByText("Unresolved", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Choose another example" })
    .press("Enter");
  await page.getByRole("link", { name: /CI coverage/ }).press("Enter");
  await expect(page).toHaveURL(/example=ci$/);
  await page.goBack();
  await expect(page).toHaveURL(/example=flag$/);
  await expect(page.getByLabel("Bundled plan")).toHaveValue(
    /new record writer/,
  );
  await page.getByRole("button", { name: "Review example" }).press("Enter");
  await run.press("Enter");
  await expect(
    page.getByRole("article").getByText("Contradicted", { exact: true }),
  ).toBeVisible();
});
