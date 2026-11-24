import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const modelRoute = "**/control-room-assets/control-room.glb";
const modelType = "model/gltf-binary";

function fixtureModel() {
  const scene = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ camera: 0, translation: [0, 0, 5] }],
    cameras: [
      {
        name: "overview",
        type: "perspective",
        perspective: { yfov: 0.55, znear: 0.1, zfar: 50 },
      },
    ],
  });
  const json = Buffer.from(scene.padEnd(Math.ceil(scene.length / 4) * 4, " "));
  const header = Buffer.alloc(20);
  header.write("glTF");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(header.length + json.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write("JSON", 16);
  return Buffer.concat([header, json]);
}

async function completeReview(page: Page) {
  await page.goto("/demo?example=ci");
  await page.getByRole("button", { name: "Review example" }).click();
  await page.getByRole("button", { name: "Run checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Review results" }),
  ).toBeVisible();
  return page.locator(".operator-room > summary");
}

async function exportMarkdown(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  expect((await download).suggestedFilename()).toBe("tactile-review.md");
}

for (const [title, response, message] of [
  ["missing model", { status: 404 }, "Local 3D model is missing."],
  [
    "HTML fallback",
    { status: 200, contentType: "text/html", body: "<html></html>" },
    "Could not check for the local 3D model.",
  ],
] as const) {
  test(`${title} keeps the preview action hidden and the export usable`, async ({
    page,
  }) => {
    const methods: string[] = [];
    const viewerRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/control-room/viewer.js")
        viewerRequests.push(request.url());
    });
    await page.route(modelRoute, (route) => {
      methods.push(route.request().method());
      return route.fulfill(response);
    });
    const summary = await completeReview(page);
    expect(methods).toEqual([]);
    await summary.press("Enter");
    await expect(page.getByText(message)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Load local 3D preview" }),
    ).toHaveCount(0);
    await summary.press("Space");
    await summary.press("Enter");
    await expect(page.getByText(message)).toBeVisible();
    expect(methods).toEqual(["HEAD"]);
    expect(viewerRequests).toEqual([]);
    await exportMarkdown(page);
  });
}

test("available model loads on demand and context loss preserves the memo", async ({
  page,
}) => {
  const methods: string[] = [];
  await page.route(modelRoute, (route) => {
    const method = route.request().method();
    methods.push(method);
    return route.fulfill({
      contentType: modelType,
      ...(method === "GET" ? { body: fixtureModel() } : {}),
    });
  });
  const summary = await completeReview(page);
  await summary.press("Enter");
  const load = page.getByRole("button", { name: "Load local 3D preview" });
  await expect(load).toBeEnabled();
  expect(methods).toEqual(["HEAD"]);
  await expect(page.locator(".operator-viewer")).toHaveCount(0);
  await exportMarkdown(page);
  await load.press("Enter");
  const canvas = page.locator('canvas[data-ready="true"]');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Report ready. The animation replays the recorded checks."),
  ).toBeVisible();
  expect(methods).toEqual(["HEAD", "GET"]);
  await page.getByRole("button", { name: "Reset camera" }).press("Enter");
  await expect(canvas).toBeVisible();
  expect(methods).toEqual(["HEAD", "GET"]);
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context");
    if (!extension)
      throw new Error("The test browser cannot simulate context loss");
    extension.loseContext();
  });
  await expect(
    page.getByText("The 3D preview lost its graphics connection."),
  ).toBeVisible();
  await expect(page.locator(".operator-viewer")).toHaveCount(0);
  await exportMarkdown(page);
});

test("unavailable WebGL leaves the stations accessible without fetching the model", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = new Proxy(getContext, {
      apply(target, canvas, args) {
        return args[0] === "webgl2"
          ? null
          : Reflect.apply(target, canvas, args);
      },
    });
  });
  const methods: string[] = [];
  await page.route(modelRoute, (route) => {
    methods.push(route.request().method());
    return route.fulfill({ contentType: modelType });
  });
  const summary = await completeReview(page);
  await summary.press("Enter");
  await page.getByRole("button", { name: "Load local 3D preview" }).click();
  await expect(
    page.getByText("WebGL 2 is unavailable in this browser."),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Operator Room stations" }),
  ).toBeVisible();
  expect(methods).toEqual(["HEAD"]);
});

test("loading failure after a valid HEAD keeps the text view usable", async ({
  page,
}) => {
  await page.route(modelRoute, (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ contentType: modelType })
      : route.fulfill({ status: 500 }),
  );
  const summary = await completeReview(page);
  await summary.press("Enter");
  await page.getByRole("button", { name: "Load local 3D preview" }).click();
  await expect(
    page.getByText("Could not load the local 3D scene."),
  ).toBeVisible();
  await exportMarkdown(page);
});

test("a corrupt model can be retried and shrinking the viewport closes the viewer", async ({
  page,
}) => {
  let downloads = 0;
  await page.route(modelRoute, (route) => {
    if (route.request().method() === "HEAD")
      return route.fulfill({ contentType: modelType });
    downloads++;
    return route.fulfill({
      contentType: modelType,
      body:
        downloads === 1 ? Buffer.from("corrupt local fixture") : fixtureModel(),
    });
  });
  const summary = await completeReview(page);
  await summary.press("Enter");
  const open = page.getByRole("button", { name: "Load local 3D preview" });
  await open.click();
  await expect(
    page.getByText("Could not load the local 3D scene."),
  ).toBeVisible();
  await open.click();
  const canvas = page.locator('canvas[data-ready="true"]');
  await expect(canvas).toBeVisible();
  await page.setViewportSize({ width: 768, height: 600 });
  await expect(canvas).toHaveCount(0);
  await expect(open).toHaveCount(0);
  await exportMarkdown(page);
});
