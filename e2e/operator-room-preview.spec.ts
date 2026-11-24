import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  roomAssetBytes,
  roomAssetFilename,
  roomAssetNamespace,
  roomAssetSha256,
  roomAssetUrl,
} from "../shared/operator-room-asset.ts";

const modelRoute = `**${roomAssetUrl}`;
const modelType = "model/gltf-binary";

test("compiled server serves only the versioned model and attribution", async ({
  request,
}) => {
  const pagesRemaining = async () => {
    const page = await request.head("/demo");
    expect(page.ok()).toBe(true);
    const value = page.headers().ratelimit?.match(/; r=(\d+)/)?.[1];
    expect(value).toBeDefined();
    return Number(value);
  };
  const before = await pagesRemaining();
  for (const encoding of ["identity", "gzip", "br"]) {
    const response = await request.get(roomAssetUrl, {
      headers: { "Accept-Encoding": encoding },
    });
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-type"]).toBe(modelType);
    expect(headers["content-encoding"]).toBe(
      encoding === "identity" ? undefined : encoding,
    );
    expect(headers["cache-control"]).toContain("immutable");
    expect(headers.vary).toContain("Accept-Encoding");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers.ratelimit).toBeTruthy();
    const model = await response.body();
    expect(model.length).toBe(roomAssetBytes);
    expect(createHash("sha256").update(model).digest("hex")).toBe(
      roomAssetSha256,
    );
    if (encoding !== "identity")
      expect(Number(headers["content-length"])).toBeLessThan(roomAssetBytes);
    await response.dispose();
  }
  const range = await request.get(roomAssetUrl, {
    headers: { Range: "bytes=0-3", "Accept-Encoding": "br, gzip" },
  });
  expect(range.status()).toBe(206);
  expect(range.headers()["content-range"]).toBe(`bytes 0-3/${roomAssetBytes}`);
  expect(range.headers()["content-encoding"]).toBeUndefined();
  expect(await range.text()).toBe("glTF");

  const credits = await request.get(`${roomAssetNamespace}/ATTRIBUTION.txt`);
  expect(credits.ok()).toBe(true);
  expect(credits.headers()["content-type"]).toContain("text/plain");
  expect(await credits.text()).toMatch(
    /masterxeon1001[\s\S]*ClayOgre[\s\S]*Worker robot/,
  );

  for (const path of [
    roomAssetNamespace,
    `${roomAssetNamespace}/control-room.glb`,
    `${roomAssetUrl}.br`,
    `${roomAssetUrl}.gz`,
    `${roomAssetNamespace}/control-room.0000000000000000.glb`,
    "/assets/operator-room/control-room.glb",
    `/build/operator-room-release/${roomAssetFilename}`,
    "/tools/operator-room/package.json",
    "/@vite/client",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  expect(await pagesRemaining()).toBe(before - 1);
});

test("compiled viewer renders the authored scene on demand under production CSP", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 960, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const methods: string[] = [];
  const viewerRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === roomAssetUrl) methods.push(request.method());
    if (path.startsWith("/assets/viewer-")) viewerRequests.push(path);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Decisions, under load." }),
  ).toBeVisible();
  expect(methods).toEqual([]);
  expect(viewerRequests).toEqual([]);
  const summary = await completeReview(page);
  await summary.press("Enter");
  const open = page.getByRole("button", { name: "Open 3D Operator Room" });
  await expect(open).toBeVisible();
  expect(methods).toEqual(["HEAD"]);
  expect(viewerRequests).toEqual([]);
  await open.click();
  const canvas = page.locator('canvas[data-ready="true"]');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  expect(methods).toEqual(["HEAD", "GET"]);
  expect(viewerRequests).toHaveLength(1);
  await expect(canvas).toHaveAttribute("data-officer-phases", /:working/, {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Reset camera" }).click();
  await canvas.evaluate((element) => {
    element.addEventListener(
      "webglcontextlost",
      () => {
        document.body.dataset.roomContextReleased = "true";
      },
      { once: true },
    );
  });
  await page.getByRole("button", { name: "Close 3D preview" }).click();
  await expect(canvas).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute(
    "data-room-context-released",
    "true",
  );
  await exportMarkdown(page);
  expect(errors).toEqual([]);
});

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
  [
    "missing model",
    { status: 404 },
    "The 3D Operator Room model is unavailable.",
  ],
  [
    "HTML fallback",
    { status: 200, contentType: "text/html", body: "<html></html>" },
    "Could not check for the 3D Operator Room.",
  ],
] as const) {
  test(`${title} keeps the preview action hidden and the export usable`, async ({
    page,
  }) => {
    const methods: string[] = [];
    const viewerRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.includes("/assets/viewer-"))
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
      page.getByRole("button", { name: "Open 3D Operator Room" }),
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
  const load = page.getByRole("button", { name: "Open 3D Operator Room" });
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

test("offscreen preview stops drawing while export remains available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const count = (
      target: typeof WebGL2RenderingContext.prototype.drawArrays,
    ) =>
      new Proxy(target, {
        apply(draw, context: WebGL2RenderingContext, args) {
          const canvas = context.canvas;
          if (canvas instanceof HTMLCanvasElement) {
            canvas.dataset.drawCalls = String(
              Number(canvas.dataset.drawCalls ?? 0) + 1,
            );
          }
          return Reflect.apply(draw, context, args);
        },
      });
    WebGL2RenderingContext.prototype.drawArrays = count(
      WebGL2RenderingContext.prototype.drawArrays,
    );
  });
  await page.route(modelRoute, (route) =>
    route.fulfill({
      contentType: modelType,
      ...(route.request().method() === "GET" ? { body: fixtureModel() } : {}),
    }),
  );
  const summary = await completeReview(page);
  await summary.press("Enter");
  await page.getByRole("button", { name: "Open 3D Operator Room" }).click();
  const canvas = page.locator('canvas[data-ready="true"]');
  await canvas.scrollIntoViewIfNeeded();
  const draws = async () =>
    Number(await canvas.getAttribute("data-draw-calls"));
  await expect.poll(draws).toBeGreaterThan(0);
  await page
    .getByRole("heading", { name: "Review results" })
    .scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      canvas.evaluate((el) => el.getBoundingClientRect().top >= innerHeight),
    )
    .toBe(true);
  await expect
    .poll(() =>
      canvas.evaluate(async (el) => {
        const before = el.dataset.drawCalls;
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
        );
        return el.dataset.drawCalls === before;
      }),
    )
    .toBe(true);
  await exportMarkdown(page);
  const before = await draws();
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(draws).toBeGreaterThan(before);
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
  await page.getByRole("button", { name: "Open 3D Operator Room" }).click();
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
  await page.getByRole("button", { name: "Open 3D Operator Room" }).click();
  await expect(
    page.getByText("Could not load the 3D Operator Room."),
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
  const open = page.getByRole("button", { name: "Open 3D Operator Room" });
  await open.click();
  await expect(
    page.getByText("Could not load the 3D Operator Room."),
  ).toBeVisible();
  await open.click();
  const canvas = page.locator('canvas[data-ready="true"]');
  await expect(canvas).toBeVisible();
  await page.setViewportSize({ width: 768, height: 600 });
  await expect(canvas).toHaveCount(0);
  await expect(open).toHaveCount(0);
  await exportMarkdown(page);
});
