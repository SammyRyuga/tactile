import { expect, test } from "@playwright/test";
import { mockAuthentication, signIn } from "./auth-fixture.ts";
import type {
  ProposalIntake,
  ProposalRevision,
  ReviewInput,
} from "../shared/review.ts";

test("attachments seed a plan and flow through clarification, review, and revision", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 820 });
    await page.emulateMedia({ colorScheme: "dark" });
  }
  await mockAuthentication(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: true } }),
  );
  const plan =
    "Replace synchronous invoice exports with a durable background queue.";
  const linkText =
    "A pilot queue processed all staged exports with the previous format.";
  const claim = {
    id: "backup",
    text: "The old export path can be removed on day one.",
  };
  const fix = "Keep the old export path until the pilot validates rollback.";
  const intakes: ProposalIntake[] = [];
  await page.route("**/api/ingest/url", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      url: "https://example.org/design",
    });
    return route.fulfill({ json: { text: linkText, truncated: false } });
  });
  await page.route("**/api/ingest/file/image", (route) => {
    expect(route.request().headers()["content-type"]).toBe(
      "application/octet-stream",
    );
    expect(route.request().postDataBuffer()).toEqual(
      Buffer.from("fixture screenshot bytes"),
    );
    return route.fulfill({
      json: {
        text: "Screenshot shows the retry policy in staging.",
        truncated: false,
      },
    });
  });
  await page.route("**/api/claims", (route) => {
    intakes.push(route.request().postDataJSON() as ProposalIntake);
    return intakes.length === 1
      ? route.fulfill({
          status: 422,
          json: {
            message: "What can you roll back?",
            clarification: {
              question: "What can you roll back?",
              missing: ["Rollback plan"],
              interpretation: "The export queue changes during the pilot.",
            },
          },
        })
      : route.fulfill({ json: { claims: [claim] } });
  });
  let reviewInput: ReviewInput | undefined;
  await page.route("**/api/reviews", (route) => {
    reviewInput = route.request().postDataJSON() as ReviewInput;
    return route.fulfill({
      contentType: "application/x-ndjson",
      body:
        JSON.stringify({
          type: "report",
          report: {
            mode: "live",
            recommendation: "Keep a fallback during rollout.",
            crossfireDecision: "Proceed with Changes",
            findings: [
              {
                claim,
                verdict: "Broken",
                rationale: "Deleting the fallback makes rollback impossible.",
                nextStep: fix,
                repair: {
                  minimalFix: fix,
                  tradeoff: "Keep both paths for the pilot.",
                },
                sourceIds: [],
              },
            ],
            sources: [],
          },
        }) + "\n",
    });
  });
  let revisionInput: ProposalRevision | undefined;
  await page.route("**/api/revisions", (route) => {
    revisionInput = route.request().postDataJSON() as ProposalRevision;
    return route.fulfill({ json: { proposal: fix } });
  });
  await page.goto("/review");
  await signIn(page);
  await page
    .getByText("Add a file or link (optional)", { exact: true })
    .click();
  const file = page.getByLabel("Upload a document or screenshot");
  await file.setInputFiles({
    name: "plan.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(plan),
  });
  await expect(page.getByText("plan.md")).toBeVisible();
  await page.getByLabel("Public page link").fill("example.org/design");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(
    page.getByRole("button", { name: "Remove attachment example.org" }),
  ).toBeVisible();
  await file.setInputFiles({
    name: "retry.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture screenshot bytes"),
  });
  await expect(page.getByText("retry.png")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Remove attachment retry.png" })
    .click();
  await expect(page.getByText("retry.png")).toHaveCount(0);
  const extract = page.getByRole("button", { name: "Analyze my plan" });
  await extract.click();
  await expect(page.getByText("What can you roll back?")).toBeVisible();
  expect(intakes[0].proposal).toBe(plan);
  expect(intakes[0].projectEvidence?.map(({ text }) => text)).toEqual([
    plan,
    linkText,
  ]);
  await page
    .getByLabel("Your plan")
    .fill(`${plan} Keep the direct export until the pilot ends.`);
  await extract.click();
  const advanced = page.getByText("Advanced settings", { exact: true });
  await expect(page.getByLabel("Decision deadline (optional)")).toBeHidden();
  await advanced.click();
  expect(intakes[1].clarification).toEqual({
    round: 1,
    previousQuestion: "What can you roll back?",
  });
  await page
    .getByLabel("Can you reverse this decision?")
    .selectOption("two_way");
  await page
    .getByLabel("Decision deadline (optional)")
    .fill("Before the pilot ends");
  await advanced.click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  expect(reviewInput?.projectEvidence).toEqual(intakes[1].projectEvidence);
  expect(reviewInput?.decision).toEqual({
    reversibility: "two_way",
    deadline: "Before the pilot ends",
  });
  await page.getByText("Revise your plan").click();
  await page
    .getByLabel("Revision guidance (optional)")
    .fill("Mention rollback first.");
  await page.getByRole("button", { name: "Create revised draft" }).click();
  await expect(page.getByLabel("Revised draft")).toHaveValue(fix);
  expect(revisionInput?.changes).toEqual([
    { id: claim.id, claim: claim.text, salvage: fix },
  ]);
  expect(revisionInput?.guidance).toBe("Mention rollback first.");
  await page.getByRole("button", { name: "Use this draft" }).click();
  await expect(page.getByLabel("Your plan")).toHaveValue(fix);
});
