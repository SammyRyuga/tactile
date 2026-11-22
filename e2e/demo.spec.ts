import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockAuthentication, signIn } from "./auth-fixture.ts";

test("the production demo stays public after a worker startup failure", async ({
  page,
  request,
}) => {
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw new Error("Could not reserve a smoke test port.");
  await new Promise<void>((finish) => reservation.close(() => finish()));
  const origin = `http://127.0.0.1:${address.port}`;
  const directory = await mkdtemp(join(tmpdir(), "tactile-no-python-"));
  const server = spawn(process.execPath, ["build/server/index.js"], {
    env: {
      ...process.env,
      RENDER: "",
      PORT: String(address.port),
      SUPABASE_URL: origin,
      SUPABASE_PUBLISHABLE_KEY: "fixture",
      TACTILE_PYTHON: join(directory, "absent-python"),
      OPENAI_API_KEY: "",
      META_API_KEY: "",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const exited = once(server, "exit");
  let diagnostic = "";
  server.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    diagnostic += chunk;
  });
  try {
    await expect
      .poll(() => diagnostic)
      .toContain('"reason":"python_not_found"');
    expect(diagnostic).not.toContain("absent-python");
    expect((await request.get(origin + "/health")).ok()).toBe(true);
    expect(
      (await request.get(origin + "/api/settings/provider")).status(),
    ).toBe(401);
    await page.goto(origin + "/demo?example=flag");
    await page.getByRole("button", { name: "Review example" }).click();
    await page.getByRole("button", { name: "Run checks" }).click();
    await expect(
      page.getByRole("heading", { name: "Review results" }),
    ).toBeVisible();
  } finally {
    server.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});

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
  await expect(
    page.getByText(/add your Meta Model API key in Settings/),
  ).toBeVisible();
  await signIn(page);
  await expect(page).toHaveURL(/\/review$/);
  await expect(
    page.getByRole("heading", { name: "Describe your plan" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your plan")).toHaveValue("");
  await page.getByRole("button", { name: "Analyze my plan" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Meta Model API key in Settings",
  );
  await page.getByRole("link", { name: /CI coverage/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Review assumptions",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  await expect(page.getByText("Suggested change").first()).toBeVisible();
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
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  await page.goto("/review");
  await page
    .getByLabel("Your plan")
    .fill("A separate draft decision to preserve.");
  const history = page.getByRole("region", { name: "Recent reports" });
  await expect(history).toBeVisible();
  const editor = page
    .getByLabel("Your plan")
    .locator("xpath=ancestor::section[1]");
  const bounds = await editor.boundingBox();
  const action = await editor
    .getByRole("button", { name: "Analyze my plan" })
    .boundingBox();
  expect(bounds!.y + bounds!.height - action!.y - action!.height).toBeLessThan(
    70,
  );
  const title = history.locator(".workspace-report-title").first();
  await expect(title).toHaveCSS("-webkit-line-clamp", "2");
  await expect(title).toHaveText(
    "Replace full test runs on pull requests with changed-package tests.",
  );

  await history
    .getByRole("button", { name: /^Replace full test runs/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await expect(page.getByLabel("Your plan")).toHaveValue(
    "A separate draft decision to preserve.",
  );
  await history
    .getByRole("button", { name: /^Delete report Replace full test runs/ })
    .press("Enter");
  await expect(history.getByRole("status")).toHaveText(
    "Report deleted from this tab.",
  );
  await expect(history.getByRole("heading")).toBeFocused();
  await expect(history.getByRole("button")).toHaveCount(0);
  await expect(page.getByLabel("Your plan")).toHaveValue(
    "A separate draft decision to preserve.",
  );
  await page.reload();
  await expect(history).toHaveCount(0);
  await expect(page.getByLabel("Your plan")).toHaveValue(
    "A separate draft decision to preserve.",
  );
});

test("signed-in replica links preserve the requested bundled review", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAuthentication(page);
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === "/api/claims" || pathname === "/api/reviews")
      apiRequests.push(pathname);
  });
  await page.goto("/review?example=replica");
  await expect(page).toHaveURL(/\/login\?next=%2Freview%3Fexample%3Dreplica/);
  await signIn(page);
  await expect(page).toHaveURL(/\/review\?example=replica/);
  await expect(page.getByRole("textbox", { name: "Assumption 1" })).toHaveValue(
    /A replica always returns an order/,
  );
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  await expect(
    page.getByText("Keep immediate order lookups on the primary", {
      exact: false,
    }),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test("a workspace example requires sign-in and retains its evidence", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await mockAuthentication(page);
  await page.goto("/review?example=flag");
  await expect(page).toHaveURL(/\/login\?next=%2Freview%3Fexample%3Dflag/);
  await signIn(page);
  await expect(
    page.getByRole("heading", {
      name: "Review assumptions",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run checks" }).click();
  await page.getByRole("button", { name: "Cancel review" }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Assumption 1" })).toHaveValue(
    /reverses changes the new writer/,
  );
  await page.getByRole("button", { name: "Run checks" }).click();
  const finding = page
    .getByRole("article")
    .filter({ hasText: "reverses changes the new writer" });
  await expect(
    finding.getByText("Contradicted", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "prevents future requests" })
      .getByText("Supported", { exact: true }),
  ).toBeVisible();
  await finding.getByText("Review trail").click();
  const timeline = page.waitForEvent("popup");
  await finding
    .getByRole("link", { name: /timeline/i })
    .first()
    .click();
  const evidence = await timeline;
  await expect(
    evidence.getByRole("heading", { name: "Feature flag timeline" }),
  ).toBeVisible();
  await evidence.close();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  const memo = await readFile(await (await download).path(), "utf8");
  expect(memo).toContain("Mode: Bundled example");
  expect(memo).toContain("#flag-timeline");
  expect(memo).toContain("Contradicted");
  expect(memo).toContain("Supported");

  await page.getByRole("button", { name: "Edit assumptions" }).click();
  const editedClaim =
    "Disabling the flag restores every record within a second.";
  await page.getByRole("textbox", { name: "Assumption 1" }).fill(editedClaim);
  await page.getByRole("button", { name: "Run checks" }).press("Enter");
  const editedFinding = page
    .getByRole("article")
    .filter({ hasText: editedClaim });
  await expect(
    editedFinding.getByText("Unresolved", { exact: true }),
  ).toBeVisible();
});

test("provider downtime keeps the draft available for retry", async ({
  page,
}) => {
  await mockAuthentication(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: true } }),
  );
  let attempts = 0;
  await page.route("**/api/claims", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({
          status: 503,
          json: {
            message: "Provider temporarily unavailable. Try again shortly.",
          },
        })
      : route.fulfill({
          json: {
            claims: [{ id: "claim-1", text: "The change preserves ordering." }],
          },
        });
  });
  await page.goto("/review");
  await signIn(page);
  const draft =
    "Route jobs through the new queue and verify ordering stays stable.";
  await page.getByLabel("Your plan").fill(draft);
  await page.getByRole("button", { name: "Analyze my plan" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await page.reload();
  await expect(page.getByLabel("Your plan")).toHaveValue(draft);
  await page.getByRole("button", { name: "Analyze my plan" }).click();
  await expect(page.getByRole("textbox", { name: "Assumption 1" })).toHaveValue(
    "The change preserves ordering.",
  );
});

test("signup prompts for email confirmation and keeps the workspace protected", async ({
  page,
}) => {
  await mockAuthentication(page);
  await page.route("**/auth/v1/signup?*", (route) =>
    route.fulfill({
      json: { user: { id: "pending-fixture-user", identities: [] } },
    }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email address").fill("engineer@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.goto("/review");
  await expect(page).toHaveURL(/\/login\?next=%2Freview/);
});

test("an unavailable authentication service keeps the workspace protected", async ({
  page,
}) => {
  await page.route("**/api/auth-config", (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.goto("/review");
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page).toHaveURL(/\/review$/);
  await expect(
    page.getByRole("button", { name: "Retry verification" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Example library" }),
  ).toHaveCount(0);
});

test("claim controls select every claim and preserve keyboard editing", async ({
  page,
}) => {
  await mockAuthentication(page);
  await page.goto("/review?demo=1");
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(page);
  const first = page.getByRole("checkbox", { name: "Include assumption 1" });
  const fourth = page.getByRole("checkbox", { name: "Include assumption 4" });
  await expect(fourth).toBeChecked();
  await expect(page.getByRole("status")).toContainText("4 of 4");
  await first.focus();
  await page.keyboard.press("Space");
  await expect(first).not.toBeChecked();
  await expect(page.getByRole("status")).toContainText("3 of 4");
  await first.check();
  await expect(page.getByRole("status")).toContainText("4 of 4");
  await page.getByRole("button", { name: "Add assumption" }).click();
  const added = page.getByRole("textbox", { name: "Assumption 5" });
  await expect(added).toBeFocused();
  await added.fill("The pilot covers all supported clients.");
  await page.getByRole("checkbox", { name: "Include assumption 5" }).check();
  await expect(page.getByRole("status")).toContainText("5 of 5");
  await page.getByRole("button", { name: "Remove assumption 5" }).click();
  await expect(added).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Assumption 4" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(page.locator(".findings > article")).toHaveCount(4);
});

test("settings require sign-in and store the appearance preference across reloads", async ({
  page,
}) => {
  await mockAuthentication(page);
  let saved = false;
  let model = "muse-spark-1.3";
  await page.route("**/api/settings/provider", (route) => {
    const method = route.request().method();
    if (method === "POST") {
      if (route.request().postDataJSON().key === "rejected-fixture-key") {
        return route.fulfill({
          status: 422,
          json: { message: "Meta rejected this key." },
        });
      }
      model = route.request().postDataJSON().model;
      saved = true;
    }
    if (method === "DELETE") {
      saved = false;
      model = "muse-spark-1.3";
    }
    return route.fulfill({ json: { saved, model } });
  });
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.locator("main").getByRole("button", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("API key", { exact: true }).fill(" ".repeat(16));
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter your Meta Model API key.",
  );
  await page
    .getByLabel("API key", { exact: true })
    .fill("rejected-fixture-key");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("alert")).toHaveText("Meta rejected this key.");
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue(
    "rejected-fixture-key",
  );
  await expect(page.getByText("No key saved", { exact: true })).toBeVisible();
  await page
    .getByLabel("API key", { exact: true })
    .fill("synthetic-fixture-key");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Key saved for this session. Meta confirmed the model’s metadata.",
  );
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("");
  await page.getByRole("radio", { name: /Muse Ember/ }).check();
  await page.getByRole("button", { name: "Save model" }).click();
  await expect(page.getByRole("status")).toContainText("Muse Ember 1.0");
  await page.reload();
  await expect(page.getByRole("radio", { name: /Muse Ember/ })).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText("Key saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("No key saved", { exact: true })).toBeVisible();
});

test("a Supabase-configured site keeps the public demo separate from protected routes", async ({
  page,
  context,
  baseURL,
}) => {
  await mockAuthentication(page);
  const operations: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/") &&
      new URL(page.url()).pathname === "/demo"
    )
      operations.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Try the public demo" }),
  ).toHaveAttribute("href", "/demo");
  await page.getByRole("button", { name: "Data consistency" }).click();
  const example = page.getByRole("link", { name: "Try this example" });
  await expect(example).toHaveAttribute("href", "/demo?example=replica");
  await example.click();
  await page.getByRole("button", { name: "Review example" }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  expect(operations).toEqual([]);
  await page.goto("/review");
  await expect(page).toHaveURL(/\/login\?next=%2Freview/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
  expect(
    (
      await context.request.get(new URL("/api/settings/provider", baseURL).href)
    ).status(),
  ).toBe(401);
});

test("settings offers an explicit model test after a metadata failure", async ({
  page,
}) => {
  await mockAuthentication(page);
  const submitted: { key: string; model: string; verification?: string }[] = [];
  await page.route("**/api/settings/provider", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { saved: false, model: "muse-spark-1.3" } });
    const input = route.request().postDataJSON() as (typeof submitted)[number];
    submitted.push(input);
    if (submitted.length === 1)
      return route.fulfill({
        status: 422,
        json: {
          code: "provider_model",
          message: "The selected model is unavailable to this key.",
        },
      });
    return input.verification === "generation"
      ? route.fulfill({
          status: 201,
          json: { saved: true, model: input.model, verification: "generation" },
        })
      : route.fulfill({
          status: 503,
          json: {
            code: "provider_catalog",
            message: "Meta’s model information was inconclusive.",
          },
        });
  });
  await page.goto("/settings");
  await signIn(page);
  const key = page.getByLabel("API key", { exact: true });
  await expect(key).toBeEnabled();
  await key.fill("synthetic-model-test-key");
  const testModel = page.getByRole("button", { name: "Test model and save" });
  await expect(testModel).toHaveCount(0);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "unavailable to this key",
  );
  await expect(testModel).toHaveCount(0);
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(testModel).toBeVisible();
  expect(submitted.slice(0, 2).map((input) => input.verification)).toEqual([
    undefined,
    undefined,
  ]);
  await expect(key).toHaveValue("synthetic-model-test-key");
  await testModel.click();
  await expect(
    page.getByText("Model test passed. Key saved for this session."),
  ).toBeVisible();
  expect(submitted[2]).toEqual({
    key: "synthetic-model-test-key",
    model: "muse-spark-1.3",
    verification: "generation",
  });
  await expect(key).toHaveValue("");
});
