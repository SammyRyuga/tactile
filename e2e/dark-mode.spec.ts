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
    page.getByRole("link", { name: "Sign in to workspace", exact: true }),
  );
  await page
    .getByRole("link", { name: "Sign in to workspace", exact: true })
    .click();
  await signIn(page);
  await expect(page).toHaveURL(/\/review$/);
  await expect(
    page.getByRole("heading", { name: "Describe your plan" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your plan")).toHaveValue("");
  await page.getByRole("link", { name: /CI coverage/ }).click();
  await expect(
    page.getByRole("heading", { name: "Review assumptions" }),
  ).toBeVisible();
  await expectReadable(page.locator(".steps [aria-current] .step-count"));
  await expectReadable(page.getByRole("textbox", { name: "Assumption 1" }));
  await expectReadable(page.getByText("Included", { exact: true }).first());
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
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
  const selectedModel = page
    .locator(".model-option")
    .filter({ has: page.getByRole("radio", { checked: true }) });
  await expectReadable(selectedModel.getByText("Muse Spark 1.3"));
  await expectReadable(selectedModel.getByText("Start here for most reviews."));
  await page.setViewportSize({ width: 320, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.goto("/review");
  await expectReadable(page.getByLabel("Your plan"), "::placeholder");

  const library = page.locator(".workspace-library");
  const history = page.getByRole("region", { name: "Recent reports" });
  for (const [scheme, apricot, blue] of [
    ["dark", "rgb(82, 54, 45)", "rgb(41, 59, 81)"],
    ["light", "rgb(255, 214, 191)", "rgb(220, 232, 255)"],
  ] as const) {
    if (scheme === "light") {
      await page.getByRole("button", { name: "Dark mode" }).click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    await expect(library).toHaveCSS("background-color", apricot);
    await expect(history).toHaveCSS("background-color", blue);
    await expectReadable(library.getByRole("heading"));
    await expectReadable(page.locator("#proposal-hint"));
    await expectReadable(history.getByRole("heading"));
    await expectReadable(history.getByText("Saved in this tab."));
    const example = library.getByRole("link", { name: /CI coverage/ });
    await example.hover();
    await expectReadable(example.getByText("Run fewer tests per pull request"));
    const recent = history.getByRole("button", {
      name: /^Replace full test runs/,
    });
    await recent.hover();
    await expectReadable(recent.locator("small"));
    const deleteReport = history.getByRole("button", {
      name: /^Delete report Replace full test runs/,
    });
    await expectReadable(deleteReport);
    await deleteReport.hover();
    await expectReadable(deleteReport);
  }
});
