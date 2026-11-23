import { expect, test } from "@playwright/test";
import { mockAuthentication, signIn } from "./auth-fixture.ts";

test("FAQ and curved links keep their keyboard semantics at release widths", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const link = page.getByRole("link", { name: "Try the public demo" });
  const faq = page.locator(".faq-list details").first();
  const disclosure = faq.locator("summary");
  for (const width of [320, 390, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(faq.locator("p")).toBeVisible();
    await expect(faq).toHaveJSProperty("open", true);
    await page.keyboard.press("Space");
    await expect(faq).toHaveJSProperty("open", false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await link.focus();
  expect(
    await link
      .locator("svg path")
      .first()
      .evaluate((p) => getComputedStyle(p).animationName),
  ).toBe("arrow-trace");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/demo$/);
});

test("recorded Operator Room displays actual checks and keeps Markdown available", async ({
  page,
}) => {
  await page.goto("/demo?example=flag");
  await page.getByRole("button", { name: "Review example" }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  await page.getByText("Operator Room", { exact: true }).press("Enter");
  const room = page.getByRole("list", { name: "Operator Room stations" });
  await expect(room.getByText("Memo ready")).toBeVisible();
  await expect(room.getByText("Not recorded").first()).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  expect((await download).suggestedFilename()).toBe("tactile-review.md");
});

test("mocked live stations track concurrent work and cancel without a report", async ({
  page,
}) => {
  await mockAuthentication(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: true } }),
  );
  await page.route("**/api/claims", (route) =>
    route.fulfill({
      json: {
        claims: [
          { id: "claim-1", text: "The queue preserves invoice ordering." },
        ],
      },
    }),
  );
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        location.href,
      );
      if (url.pathname !== "/api/reviews") return nativeFetch(input, options);
      const encoder = new TextEncoder();
      const payload = JSON.parse(String(options?.body));
      if (
        JSON.stringify([...payload.reviewers].sort()) !==
        JSON.stringify(["builder", "researcher"])
      )
        throw new Error("Fixture received an unexpected reviewer panel");
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              const send = (event: unknown) =>
                controller.enqueue(
                  encoder.encode(JSON.stringify(event) + "\n"),
                );
              send({
                type: "progress",
                claimId: "claim-1",
                stage: "Feasibility",
                status: "running",
              });
              send({
                type: "progress",
                claimId: "claim-1",
                stage: "Evidence",
                status: "running",
              });
              addEventListener(
                "fixture-review-completed",
                () => {
                  send({
                    type: "progress",
                    claimId: "claim-1",
                    stage: "Feasibility",
                    status: "done",
                  });
                  send({
                    type: "progress",
                    claimId: "claim-1",
                    stage: "Evidence",
                    status: "unavailable",
                  });
                  send({
                    type: "report",
                    report: {
                      mode: "live",
                      findings: [],
                      sources: [],
                      recommendation: "Keep the ordering test.",
                    },
                  });
                  controller.close();
                },
                { once: true, signal: options?.signal ?? undefined },
              );
              options?.signal?.addEventListener(
                "abort",
                () => controller.error(options.signal?.reason),
                { once: true },
              );
            },
          }),
        ),
      );
    };
  });
  await page.goto("/review");
  await signIn(page);
  await page
    .getByLabel("Your plan")
    .fill("Move invoice exports to a queue and preserve ordering per account.");
  await page.getByRole("button", { name: "Analyze my plan" }).click();
  await page.getByText("Advanced settings", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Devil.s Advocate/ }).uncheck();
  await page.getByRole("checkbox", { name: /^Operator/ }).uncheck();
  const run = page.getByRole("button", { name: "Run checks" });
  await run.click();
  await page.getByText("Operator Room", { exact: true }).click();
  const stations = page.getByRole("list", { name: "Operator Room stations" });
  await expect(stations.getByText("In progress")).toHaveCount(2);
  await expect(stations.getByText("Not selected")).toHaveCount(2);
  await page.getByRole("button", { name: "Cancel review" }).click();
  await expect(stations).toHaveCount(0);
  await run.click();
  await page.getByText("Operator Room", { exact: true }).click();
  await expect(stations.getByText("In progress")).toHaveCount(2);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("fixture-review-completed")),
  );
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  await expect(stations.getByText("Unavailable")).toBeVisible();
  await expect(stations.getByText("Memo ready")).toBeVisible();
});
