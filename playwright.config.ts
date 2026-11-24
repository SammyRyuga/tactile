import { defineConfig, devices } from "@playwright/test";

const staging = process.env.TACTILE_SMOKE_URL;
const mobileOrigin = "http://127.0.0.1:5191";
const production3dOrigin = "http://127.0.0.1:5190";
const previewSpec = "operator-room-preview.spec.ts";

const demoEnv = {
  OPENAI_API_KEY: "",
  META_API_KEY: "",
  SUPABASE_URL: "",
  SUPABASE_PUBLISHABLE_KEY: "",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: staging ? "public-demo.spec.ts" : undefined,
  use: { baseURL: staging ?? "http://127.0.0.1:5189" },
  projects: [
    {
      name: "desktop",
      testIgnore: previewSpec,
      use: devices["Desktop Chrome"],
    },
    {
      name: "mobile",
      testIgnore: previewSpec,
      use: { ...devices["Pixel 7"], baseURL: staging ?? mobileOrigin },
    },
    ...(!staging
      ? [
          {
            name: "production-3d",
            testMatch: previewSpec,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: production3dOrigin,
              launchOptions: {
                args: [
                  "--use-angle=swiftshader",
                  "--enable-unsafe-swiftshader",
                ],
              },
            },
          },
        ]
      : []),
  ],
  webServer: staging
    ? undefined
    : [
        {
          command: "npm start",
          env: { ...demoEnv, PORT: "5189" },
          url: "http://127.0.0.1:5189/health",
        },
        {
          command: "npm start",
          env: { ...demoEnv, PORT: "5190" },
          url: production3dOrigin + "/health",
        },
        {
          // Isolate the per-IP page budget across independent browser projects.
          command: "npm start",
          env: { ...demoEnv, PORT: "5191" },
          url: mobileOrigin + "/health",
        },
      ],
});
