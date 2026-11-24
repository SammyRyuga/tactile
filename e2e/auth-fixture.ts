import { Buffer } from "node:buffer";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function mockAuthentication(
  page: Page,
  id = "00000000-0000-4000-8000-000000000001",
  email = "engineer@example.invalid",
) {
  const user = {
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: false,
    app_metadata: {},
    user_metadata: {},
  };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp })}.dGVzdA`;
  await page.route("**/api/auth-config", (route) =>
    route.fulfill({
      json: {
        auth: {
          url: new URL(route.request().url()).origin,
          publishableKey: "browser-fixture-publishable-key",
        },
      },
    }),
  );
  await page.route("**/auth/v1/token?*", (route) =>
    route.fulfill({
      json: {
        user,
        access_token: accessToken,
        token_type: "bearer",
        expires_at: exp,
        expires_in: 3600,
        refresh_token: "browser-fixture-refresh",
      },
    }),
  );
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/api/status", (route) =>
    route.fulfill({ json: { live: false } }),
  );
}

export async function signIn(page: Page, email = "engineer@example.invalid") {
  await expect(
    page.getByRole("heading", { name: "Sign in to Tactile" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
