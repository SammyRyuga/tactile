import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { mockAuthentication, signIn } from "./auth-fixture.ts";

async function expectReadable(element: Locator, pseudo?: string) {
  const ratio = await element.evaluate((node, pseudoElement) => {
    function parse(value: string) {
      return (value.match(/[\d.]+/g) ?? []).map(Number);
    }
    function luminance(rgb: number[]) {
      return rgb.slice(0, 3).reduce((sum, component, index) => {
        const value = component / 255;
        const linear =
          value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index];
      }, 0);
    }
    const text = luminance(parse(getComputedStyle(node, pseudoElement).color));
    for (
      let parent: Element | null = node;
      parent;
      parent = parent.parentElement
    ) {
      const background = parse(getComputedStyle(parent).backgroundColor);
      if ((background[3] ?? 1) < 1) continue;
      const surface = luminance(background);
      return (
        (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05)
      );
    }
    return 0;
  }, pseudo);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

test("dark theme keeps headings, inputs, controls, and verdicts readable", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await mockAuthentication(page);
  await page.route("**/api/settings/provider", (route) =>
    route.fulfill({ json: { saved: false } }),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectReadable(
    page.getByRole("heading", { name: "Inspect a review." }),
  );
  await expectReadable(
    page.getByRole("link", { name: "Sign in to review", exact: true }),
  );
  await page
    .getByRole("link", { name: "Sign in to review", exact: true })
    .click();
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Confirm the claims" }),
  ).toBeVisible();
  await expectReadable(page.locator(".steps [aria-current] .step-count"));
  await expectReadable(page.getByRole("textbox", { name: "Claim 1" }));
  await expectReadable(page.getByText("Included", { exact: true }).first());
  await page.getByRole("button", { name: "Run review" }).click();
  await expect(
    page.getByRole("heading", { name: "Decision report" }),
  ).toBeVisible();
  await expectReadable(page.locator(".finding .verdict").first());
  await page.getByText("Review trail", { exact: false }).first().click();
  await expectReadable(
    page.locator(".review-trail[open] .check-status").first(),
  );
  await page.goto("/settings");
  await expect(page.getByText("No key saved", { exact: true })).toBeVisible();
  await expectReadable(
    page.getByLabel("API key", { exact: true }),
    "::placeholder",
  );
  await expectReadable(page.getByRole("button", { name: "Save key" }));
  await page.goto("/review");
  await expectReadable(
    page.getByLabel("Engineering proposal"),
    "::placeholder",
  );
});
