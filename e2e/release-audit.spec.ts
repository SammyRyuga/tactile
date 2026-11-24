import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockAuthentication, signIn } from "./auth-fixture.ts";

const claim = { id: "audit-claim", text: "The fixture queue preserves order." };
const plan = "Run the audit queue under controlled load and check ordering.";

async function prepare(page: Page) {
  await mockAuthentication(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: true } }),
  );
  await page.route("**/api/claims", (route) =>
    route.fulfill({ json: { claims: [claim] } }),
  );
  await page.goto("/review");
  await signIn(page);
  await page.getByLabel("Your plan").fill(plan);
  await page.getByRole("button", { name: "Analyze my plan" }).click();
  return page.getByRole("button", { name: "Run checks" });
}

test("a lost report keeps the editor usable and a retry exports only its own findings", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/api/reviews", (route) => {
    count++;
    const { claims, proposal } = route.request().postDataJSON();
    expect(proposal).toBe(plan);
    const value =
      count === 1
        ? {
            type: "progress",
            stage: "Feasibility",
            status: "running",
            claimId: claim.id,
          }
        : {
            type: "report",
            report: {
              mode: "live",
              recommendation: "Keep the audit replay.",
              findings: [
                {
                  claim: claims[0],
                  verdict: "Unresolved",
                  rationale: "No measured data.",
                  nextStep: "Record queue order.",
                  sourceIds: [],
                },
              ],
              sources: [],
            },
          };
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: JSON.stringify(value) + "\n",
    });
  });
  const run = await prepare(page);
  await run.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "closed before a report arrived" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toHaveCount(0);
  await expect(run).toBeEnabled();
  await run.click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: claim.text, exact: true, level: 3 }),
  ).toBeVisible();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  const markdown = await readFile(await (await exported).path(), "utf8");
  expect(markdown).toContain(claim.text);
  expect(markdown).toContain("Keep the audit replay.");
  expect(markdown).toContain("Unresolved");
  expect(markdown).toContain("Record queue order.");
  expect(count).toBe(2);
});

test("sign-out cancels a running stream before waiting on settings cleanup", async ({
  page,
}) => {
  let release = () => {};
  const hold = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/settings/provider", async (route) => {
    await hold;
    await route.fulfill({ json: { saved: false } });
  });
  await page.route("**/auth/v1/logout?*", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const target = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      );
      if (target.pathname !== "/api/reviews")
        return nativeFetch(input, options);
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  '{"type":"progress","stage":"Feasibility","status":"running"}\n',
                ),
              );
              options?.signal?.addEventListener(
                "abort",
                () => {
                  document.documentElement.dataset.auditAborted = "true";
                },
                { once: true },
              );
            },
          }),
        ),
      );
    };
  });
  try {
    const run = await prepare(page);
    await run.click();
    await expect(
      page.getByRole("heading", { name: "Checking your assumptions" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-audit-aborted",
      "true",
    );
    await expect(run).toBeVisible();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/review");
  await expect(
    page.getByRole("heading", { name: "Sign in to Tactile" }),
  ).toBeVisible();
});

test("a restored protected page revalidates the session before use", async ({
  page,
}) => {
  await prepare(page);
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 401,
      json: { message: "Fixture session expired" },
    }),
  );
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(
    page.getByRole("heading", { name: "Sign in to Tactile" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your plan")).toHaveCount(0);
});

test("direct navigation protects route aliases handled by Express", async ({
  page,
}) => {
  for (const [path, next] of [
    ["/Review/", "/review"],
    ["/SETTINGS/", "/settings"],
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Sign in to Tactile" }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("next")).toBe(next);
  }
});

test("two disposable accounts keep separate drafts across tab reloads", async ({
  page,
}) => {
  await mockAuthentication(page);
  await page.goto("/review");
  await signIn(page);
  const first = page.getByLabel("Your plan");
  await first.fill("First fixture account plan.");

  const other = await page.context().newPage();
  try {
    const email = "second@example.invalid";
    await mockAuthentication(
      other,
      "00000000-0000-4000-8000-000000000002",
      email,
    );
    await other.goto("/review");
    await signIn(other, email);
    const second = other.getByLabel("Your plan");
    await expect(second).toHaveValue("");
    await second.fill("Second fixture account plan.");
    await other.reload();
    await expect(second).toHaveValue("Second fixture account plan.");
    await page.reload();
    await expect(first).toHaveValue("First fixture account plan.");
  } finally {
    await other.close();
  }
});
