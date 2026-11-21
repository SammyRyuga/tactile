import { expect, test } from "@playwright/test";
import { mockAuthentication, signIn } from "./auth-fixture.ts";

test("the review room shows streamed activity and opens recorded checks from the report", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 820 });
  const claim = {
    id: "worker",
    risk: "technical",
    text: "Each worker processes 120 jobs per minute.",
  };
  const observation = "The staging fixture processed 120 jobs per worker.";
  await mockAuthentication(page);
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: true } }),
  );
  await page.route("**/api/claims", (route) =>
    route.fulfill({ json: { claims: [claim] } }),
  );
  await page.emulateMedia({
    reducedMotion: "reduce",
    colorScheme: testInfo.project.name === "mobile" ? "dark" : "light",
  });
  await page.addInitScript(
    ({ claim, observation }) => {
      const fetchFromNetwork = window.fetch;
      window.fetch = (request, init) => {
        if (String(request) !== "/api/reviews")
          return fetchFromNetwork(request, init);
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                const encoder = new TextEncoder();
                function emit(event: object) {
                  controller.enqueue(
                    encoder.encode(JSON.stringify(event) + "\n"),
                  );
                }
                emit({
                  type: "progress",
                  stage: "Feasibility",
                  status: "running",
                });
                emit({
                  type: "progress",
                  claimId: claim.id,
                  stage: "Feasibility",
                  status: "running",
                  detail: observation,
                });
                window.addEventListener(
                  "finish-fixture-review",
                  () => {
                    emit({
                      type: "report",
                      report: {
                        recommendation:
                          "Repeat the staging test before rollout.",
                        mode: "live",
                        crossfireDecision: "Hold",
                        findings: [
                          {
                            claim,
                            verdict: "Unresolved",
                            rationale:
                              "Production throughput was not measured.",
                            nextStep: "Run the production pilot.",
                            sourceIds: [],
                            audit: [
                              {
                                stage: "Feasibility",
                                status: "complete",
                                observation,
                              },
                            ],
                          },
                        ],
                        sources: [],
                      },
                    });
                    controller.close();
                  },
                  { once: true },
                );
              },
            }),
            { headers: { "Content-Type": "application/x-ndjson" } },
          ),
        );
      };
    },
    { claim, observation },
  );

  await page.goto("/review");
  await signIn(page);
  await page
    .getByLabel("Your plan")
    .fill("Move invoice exports to background workers and monitor queue size.");
  await page
    .getByRole("button", { name: /^(Find claims|Run stress test)$/ })
    .click();
  await page.getByRole("button", { name: /^(Run review|Run Tests)$/ }).click();
  const room = page.locator(".review-room");
  await expect(
    room.getByRole("button", { name: "Feasibility In progress" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(room.getByText(observation)).toBeVisible();
  await room.getByRole("button", { name: "Evidence Waiting" }).press("Enter");
  await expect(room.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(room.getByText("Check updates will appear here.")).toBeVisible();
  expect(
    await room.evaluate((element) => {
      const room = element.getBoundingClientRect();
      return Array.from(element.children).every((child) => {
        const { left, right } = child.getBoundingClientRect();
        return left >= room.left && right <= room.right;
      });
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.evaluate(() =>
    window.dispatchEvent(new Event("finish-fixture-review")),
  );
  await expect(
    page.getByRole("heading", { name: "Decision Memo" }),
  ).toBeVisible();
  await page.getByText("See the review room").press("Enter");
  await expect(
    room.getByRole("button", { name: "Feasibility Complete" }),
  ).toBeVisible();
  await expect(room.getByText(observation)).toBeVisible();
  await room.getByRole("button", { name: "Decision memo Complete" }).click();
  await expect(
    room.getByText("Repeat the staging test before rollout."),
  ).toBeVisible();
});
