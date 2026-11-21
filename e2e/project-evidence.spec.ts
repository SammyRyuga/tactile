import { expect, test } from "@playwright/test";
import { mockAuthentication, signIn } from "./auth-fixture.ts";
import type { ReviewInput } from "../shared/review.ts";

test("project evidence can verify a claim and support a one-claim re-review", async ({
  page,
}) => {
  await mockAuthentication(page);
  const quote =
    "Checkout staging p95 was 128 ms under 500 requests per second.";
  const claims = [
    {
      id: "latency",
      text: "Checkout staging p95 stays below 150 ms at 500 requests per second.",
      risk: "evidence",
    },
    {
      id: "load",
      text: "The new workers can sustain 10 jobs per second.",
      risk: "technical",
    },
  ] as const;
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: true } }),
  );
  await page.route("**/api/claims", (route) =>
    route.fulfill({ json: { claims } }),
  );
  const submitted: ReviewInput[] = [];
  await page.route("**/api/reviews", async (route) => {
    const input = route.request().postDataJSON() as ReviewInput;
    submitted.push(input);
    const findings = input.claims.map((claim) =>
      claim.id === "latency"
        ? {
            claim,
            verdict: "Supported",
            basis: "project",
            rationale: "Measured in staging.",
            nextStep: "Repeat before rollout.",
            sourceIds: [],
            projectCitations: [
              {
                id: "project-1-1",
                title: "benchmark.csv",
                quote,
                relation: "supports",
              },
            ],
          }
        : {
            claim,
            verdict: "Unresolved",
            reason: "Evidence insufficient",
            rationale: "Throughput was not measured.",
            nextStep: "Capture completed jobs per second.",
            missingInformation: "Job throughput under load.",
            sourceIds: [],
          },
    );
    await route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "report",
          report: {
            mode: "live",
            recommendation: "Measure at the next rollout.",
            findings,
            sources: [],
          },
        }) + "\n",
    });
  });
  await page.goto("/review");
  await signIn(page);
  await page
    .getByLabel("Your plan")
    .fill(
      "Roll out a change to checkout staging and measure latency and job throughput under load.",
    );
  await page
    .getByRole("button", { name: /^(Find claims|Run stress test)$/ })
    .click();
  await page.getByText("Project evidence", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Attach a text file").setInputFiles({
    name: "benchmark.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(quote),
  });
  await expect(page.getByLabel("Evidence excerpt 1")).toHaveValue(quote);
  const claim = page.locator(".claim-row").nth(1);
  await claim.getByText("Add an engineering check").click();
  await claim.getByLabel("Check", { exact: true }).selectOption("throughput");
  await claim.getByLabel("Jobs per minute per worker").fill("120");
  await claim.getByLabel("Workers", { exact: true }).fill("5");
  await claim.getByLabel("Required jobs per second").fill("10");
  await page.getByRole("button", { name: /^(Run review|Run Tests)$/ }).click();
  await expect(page.getByText("Reviewer-supplied evidence")).toBeVisible();
  await expect(page.getByText(quote)).toBeVisible();
  expect(submitted[0].projectEvidence?.[0].text).toBe(quote);
  expect(submitted[0].claims[1].engineeringCheck?.values).toEqual([120, 5, 10]);
  await page.getByText("Settle this claim").click();
  const artifact = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV checker" }).click();
  expect((await artifact).suggestedFilename()).toBe("check-measurement.py");
  await page.getByText("Record rollout outcomes").click();
  const first = page.locator(".outcome-log form").first();
  await first.getByLabel("Observed outcome").selectOption("held");
  await first
    .getByLabel("Observation")
    .fill("The staging measurement held on the follow-up.");
  await first.getByRole("button", { name: "Save outcome" }).click();
  await expect(page.getByText("Outcome saved on this device.")).toBeVisible();
  await page.reload();
  await page.getByText("Record rollout outcomes").click();
  await expect(
    page.locator(".outcome-log form").first().getByLabel("Observed outcome"),
  ).toHaveValue("held");
  await page
    .getByRole("article")
    .filter({ hasText: claims[1].text })
    .getByRole("button", { name: "Re-review this claim" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /^(Choose what to check|We identified \d+ claims to test)$/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^(Run review|Run Tests)$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Decision report" }),
  ).toBeVisible();
  expect(submitted[1].claims.map(({ id }) => id)).toEqual(["load"]);
  await page.getByText("Record rollout outcomes").click();
  await page.getByRole("button", { name: "Track after rollout" }).click();
  await page.getByRole("button", { name: "Start a new review" }).click();
  await page.reload();
  await page.getByText("Outcome log", { exact: true }).click();
  await expect(page.getByText("Awaiting a rollout result.")).toBeVisible();
});
