import { defineConfig, devices } from "@playwright/test";

const staging = process.env.TACTILE_SMOKE_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: staging ? "public-demo.spec.ts" : undefined,
  use: { baseURL: staging ?? "http://127.0.0.1:5189" },
  projects: [
    { name: "desktop", use: devices["Desktop Chrome"] },
    { name: "mobile", use: devices["Pixel 7"] },
  ],
  webServer: staging
    ? undefined
    : {
        command: "npm start",
        env: {
          PORT: "5189",
          OPENAI_API_KEY: "",
          META_API_KEY: "",
          SUPABASE_URL: "",
          SUPABASE_PUBLISHABLE_KEY: "",
        },
        url: "http://127.0.0.1:5189/health",
      },
});
