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
                        crossfireMemo: {
                          survivingCore: "Run the pilot in staging.",
                          dissents: [],
                          nextActions: [],
                        },
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
                              {
                                stage: "Evidence",
                                status: "failed",
                                observation:
                                  "The requested source was unavailable.",
                              },
                              {
                                stage: "Adoption",
                                status: "skipped",
                                observation:
                                  "This example skipped the rollout check.",
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
  await page.getByRole("button", { name: "Analyze my plan" }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  const room = page.locator(".review-room");
  await expect(
    page.getByRole("heading", { name: "Checking your assumptions" }),
  ).toBeFocused();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(room).toBeHidden();
  await page
    .getByText("Explore the review room", { exact: true })
    .press("Enter");
  const stations = room.getByRole("group", { name: "Review stations" });
  await expect(stations.getByRole("button")).toHaveCount(5);
  expect(
    await stations.getByRole("button").evaluateAll((buttons) => {
      const scene = buttons[0].parentElement?.getBoundingClientRect();
      if (!scene) return false;
      const bounds = buttons.map((button) => button.getBoundingClientRect());
      if (
        bounds.some(
          ({ left, right, top, bottom }) =>
            left < scene.left ||
            right > scene.right ||
            top < scene.top ||
            bottom > scene.bottom,
        )
      )
        return false;
      return bounds.every((a, index) =>
        bounds
          .slice(index + 1)
          .every(
            (b) =>
              a.right <= b.left ||
              b.right <= a.left ||
              a.bottom <= b.top ||
              b.bottom <= a.top,
          ),
      );
    }),
  ).toBe(true);
  const activity = page.locator(".review-activity");
  await expect(activity).not.toHaveAttribute("open", "");
  await activity.locator(":scope > summary").press("Enter");
  await expect(activity.locator(".activity")).toBeVisible();
  await activity.locator(":scope > summary").press("Enter");
  await expect(
    room.getByRole("button", { name: "Builder In progress" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(room.getByText(observation)).toBeVisible();
  await room.getByRole("button", { name: "Researcher Waiting" }).press("Enter");
  await expect(room.getByRole("heading", { name: "Researcher" })).toBeVisible();
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
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  const reportDisclosures = page.locator(".report-details > details");
  await expect(reportDisclosures).toHaveCount(3);
  await page.getByText("Read your plan", { exact: true }).press("Enter");
  expect(
    await reportDisclosures.evaluateAll((cards) => {
      const [decision, proposal, room] = cards.map((card) =>
        card.getBoundingClientRect(),
      );
      return (
        decision.left === proposal.left &&
        room.left === proposal.left &&
        decision.width === proposal.width &&
        room.width === proposal.width &&
        decision.bottom <= proposal.top &&
        proposal.bottom <= room.top
      );
    }),
  ).toBe(true);
  await page
    .getByText("How we reached this result", { exact: true })
    .press("Enter");
  await expect(page.getByText("Run the pilot in staging.")).toBeVisible();
  await page.getByText("See the review room").press("Enter");
  await expect(
    room.getByRole("button", { name: "Researcher Incomplete" }),
  ).toBeVisible();
  await expect(
    room.getByRole("button", { name: "Operator Skipped" }),
  ).toBeVisible();
  await expect(
    room.getByRole("button", { name: "Devil's Advocate Not recorded" }),
  ).toBeVisible();
  await room.getByRole("button", { name: "Builder Complete" }).click();
  await expect(room.getByText(observation)).toBeVisible();
  await room.getByRole("button", { name: "Steelman Memo ready" }).click();
  await expect(
    room.getByText("Repeat the staging test before rollout."),
  ).toBeVisible();
});
