import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cases, origin } from "./checks.mjs";

const [outputPath, ...requested] = process.argv.slice(2);
if (!outputPath)
  throw new Error(
    "Usage: node qa/blackbox/run.mjs <outside-checkout-output-directory> [BB-001 ...]",
  );
const out = resolve(outputPath);
if (
  out === process.cwd() ||
  out.startsWith(process.cwd() + (process.platform === "win32" ? "\\" : "/"))
) {
  throw new Error(
    "Place screenshots, traces, downloads and temporary profiles outside the checkout.",
  );
}
await mkdir(out, { recursive: true });
const health = await fetch(origin + "/health").then((r) => r.json());
if (health.ok !== true)
  throw new Error("The local server at " + origin + " must be healthy.");
const filters = requested.filter((arg) => arg.startsWith("BB-"));
const selected = cases.filter(
  ({ id }) => !filters.length || filters.includes(id),
);
if (!selected.length) throw new Error("No matching case IDs.");
const passes = [
  { number: 1, width: 1440, height: 960, theme: "light", channel: "chromium" },
  { number: 2, width: 1280, height: 900, theme: "light", channel: "chromium" },
  {
    number: 3,
    width: 390,
    height: 844,
    theme: "dark",
    channel: "chromium",
    reducedMotion: "reduce",
  },
];
if (
  await access(
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ).then(
    () => true,
    () => false,
  )
) {
  passes[2].channel = "msedge";
}
const browserPool = new Map();
for (const channel of new Set(passes.map((pass) => pass.channel))) {
  try {
    browserPool.set(
      channel,
      await chromium.launch(channel === "chromium" ? {} : { channel }),
    );
  } catch (error) {
    if (channel === "chromium") throw error;
    passes[2].channel = "chromium";
    console.warn(
      "Edge launch unavailable; contrast pass uses Chromium: " +
        error.message.split("\n")[0],
    );
  }
}
const extension = join(out, "qa-zoom-extension");
await mkdir(extension, { recursive: true });
await writeFile(
  join(extension, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Tactile QA tab zoom",
    version: "1.0",
    permissions: ["tabs"],
    background: { service_worker: "worker.js" },
  }),
);
await writeFile(
  join(extension, "worker.js"),
  "chrome.runtime.onInstalled.addListener(() => {});\n",
);

const retained = new Set([
  "BB-001",
  "BB-010",
  "BB-029",
  "BB-041",
  "BB-047",
  "BB-048",
  "BB-049",
  "BB-053",
]);
const results = [];

async function execute(test, pass) {
  const isZoom = test.id === "BB-048";
  const browser = browserPool.get(isZoom ? "chromium" : pass.channel);
  const label = test.id + "-" + pass.number;
  const options = {
    acceptDownloads: true,
    viewport: { width: pass.width, height: pass.height },
    colorScheme: pass.theme,
    reducedMotion: pass.reducedMotion ?? "no-preference",
    hasTouch: pass.width < 500,
    isMobile: pass.width < 500,
  };
  const zoomWidth = [1440, 1280, 1024][pass.number - 1] ?? 1440;
  const context = isZoom
    ? await chromium.launchPersistentContext(
        await mkdtemp(join(out, "zoom-profile-")),
        {
          channel: "chromium",
          headless: true,
          ...options,
          viewport: null,
          hasTouch: false,
          isMobile: false,
          args: [
            "--window-size=" + zoomWidth + ",1000",
            "--disable-extensions-except=" + extension,
            "--load-extension=" + extension,
          ],
        },
      )
    : await browser.newContext(options);
  context.setDefaultTimeout(3600);
  context.setDefaultNavigationTimeout(6000);
  const network = [];
  const external = [];
  const errors = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "http:" || url.protocol === "https:") {
      if (url.origin !== origin) {
        external.push(url.origin + url.pathname);
        await route.abort("blockedbyclient");
        return;
      }
    }
    await route.continue();
  });
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin)
      network.push({
        path: url.pathname,
        method: response.request().method(),
        status: response.status(),
      });
  });
  const p = context.pages()[0] ?? (await context.newPage());
  p.on("pageerror", (error) => errors.push(error.message));
  p.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
  });
  let status = "Pass";
  let actual;
  let viewport = null;
  let theme;
  let screenshot;
  let trace;
  try {
    actual = await test.run({
      p,
      context,
      label,
      out,
      pass,
      network,
      external,
      errors,
      async zoom(page, amount) {
        const worker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent("serviceworker", { timeout: 5000 }));
        return worker.evaluate(
          async ({ url, zoom }) => {
            const tabs = await chrome.tabs.query({});
            const current = tabs.find((tab) => tab.url === url);
            await chrome.tabs.setZoom(current.id, zoom);
            return chrome.tabs.getZoom(current.id);
          },
          { url: page.url(), zoom: amount },
        );
      },
    });
    if (actual?.blocked) {
      status = "Blocked";
      actual = actual.blocked;
    }
  } catch (error) {
    status = "Fail";
    actual = String(error.message)
      .replace(/\u001b\[[\d;]*m/g, "")
      .split("Call log:")[0]
      .trim();
  }
  if (
    status !== "Pass" ||
    retained.has(test.id) ||
    requested.includes("--all-artifacts")
  ) {
    screenshot = label + ".png";
    trace = label + ".zip";
    try {
      await p.screenshot({
        path: join(out, screenshot),
        fullPage: true,
        timeout: 5500,
      });
    } catch {
      screenshot = undefined;
    }
    await context.tracing.stop({ path: join(out, trace) });
  } else {
    await context.tracing.stop();
  }
  if (!p.isClosed()) {
    try {
      ({ viewport, theme } = await p.evaluate(() => ({
        viewport: innerWidth + "×" + innerHeight,
        theme: getComputedStyle(document.documentElement).colorScheme,
      })));
    } catch {
      // A browser error page may prevent extracting the final viewport and theme.
    }
  }
  await context.close();
  const configuredViewport =
    test.id === "BB-047"
      ? "1440,1280,1024,768,390,320"
      : test.id === "BB-048"
        ? zoomWidth + "×1000 at 200%"
        : test.id === "BB-053"
          ? "320×780"
          : pass.width + "×" + pass.height;
  const entry = {
    id: test.id,
    title: test.title,
    steps: test.steps,
    expected: test.expected,
    pass: pass.number,
    browser: isZoom
      ? "Chromium (zoom profile)"
      : pass.channel === "msedge"
        ? "Microsoft Edge"
        : "Chromium",
    version: isZoom
      ? await browserPool.get("chromium").version()
      : browser.version(),
    viewport: configuredViewport,
    finalViewport: viewport,
    preferredTheme: pass.theme,
    finalTheme: theme,
    status,
    actual,
    screenshot,
    trace,
  };
  if (test.id === "BB-044")
    entry.network = { requests: network, outsideOrigin: external };
  results.push(entry);
  console.log(label + " " + status + " " + String(actual).split("\n")[0]);
}

for (const pass of passes) {
  // These cases interact with the system clipboard or use a separate Chromium profile.
  const serial = new Set(["BB-031", "BB-048", "BB-053"]);
  for (const test of selected.filter(({ id }) => serial.has(id)))
    await execute(test, pass);
  const queue = selected.filter(({ id }) => !serial.has(id));
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let test = queue.shift(); test; test = queue.shift())
        await execute(test, pass);
    }),
  );
}
await Promise.all([...browserPool.values()].map((browser) => browser.close()));
results.sort((a, b) => a.id.localeCompare(b.id) || a.pass - b.pass);
await writeFile(
  join(out, "results.json"),
  JSON.stringify(results, null, 2) + "\n",
);
for (const status of ["Pass", "Fail", "Blocked", "Inconclusive"]) {
  console.log(
    status + ": " + results.filter((entry) => entry.status === status).length,
  );
}
process.exitCode = results.some((entry) => entry.status === "Fail") ? 1 : 0;
