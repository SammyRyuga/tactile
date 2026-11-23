import { createCrossfireEngine } from "./crossfire-engine.ts";
import { CrossfireStartupError } from "./crossfire-runtime.ts";
import { existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { rateLimit } from "express-rate-limit";
import ipaddr from "ipaddr.js";
import { createApp } from "./app.ts";
import { createSessionVerifier, reserveReview } from "./auth.ts";
import { createProvider } from "./provider.ts";

const hosted = process.env.RENDER === "true";
const key = hosted ? undefined : process.env.OPENAI_API_KEY?.trim();
const provider = key
  ? createProvider(key, process.env.OPENAI_MODEL?.trim() || "gpt-5-mini")
  : undefined;
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const auth =
  supabaseUrl && publishableKey
    ? { url: supabaseUrl, publishableKey }
    : undefined;
const dev = process.argv.includes("--dev");
if (provider && !auth) {
  throw new Error("Live reviews require Supabase Auth.");
}
const hostname = process.env.RENDER_EXTERNAL_HOSTNAME;
const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const proxyRanges = (process.env.TRUSTED_PROXY_RANGES ?? "")
  .split(",")
  .map((range) => range.trim())
  .filter(Boolean)
  .map((range) => ipaddr.parseCIDR(range));
async function initializeCrossfire() {
  try {
    const engine = createCrossfireEngine(process.env.TACTILE_PYTHON, hosted);
    const readiness = await engine.checkRuntime();
    appOptions.crossfire = engine;
    appOptions.crossfireUnavailable = false;
    console.info(
      JSON.stringify({ event: "crossfire_runtime_ready", ...readiness }),
    );
  } catch (error) {
    const diagnostic =
      error instanceof CrossfireStartupError
        ? error.diagnostic
        : { reason: "spawn_failed" };
    console.error(
      JSON.stringify({ event: "crossfire_runtime_unavailable", ...diagnostic }),
    );
  }
}
const appOptions: NonNullable<Parameters<typeof createApp>[1]> = {
  auth,
  crossfireUnavailable: Boolean(auth),
  verifySession: auth ? createSessionVerifier(auth) : undefined,
  reserveUsage: auth ? (token) => reserveReview(auth, token) : undefined,
  revision: hosted ? process.env.RENDER_GIT_COMMIT : undefined,
  allowedHosts: [
    ...(hostname ? [hostname] : ["localhost", "127.0.0.1"]),
    ...allowedHosts,
  ],
  allowDevAssets: dev,
  trustProxy: proxyRanges.length
    ? (address, hop) =>
        hop === 0 &&
        ipaddr.subnetMatch(ipaddr.process(address), { proxy: proxyRanges }) ===
          "proxy"
    : hosted,
  verifierModel: process.env.OPENAI_VERIFIER_MODEL?.trim() || undefined,
};
const app = createApp(provider, appOptions);
app.get("/demo-evidence.html", (_request, response) =>
  response.redirect(301, "/example-evidence.html"),
);
const server = createServer(app);
const host = hosted ? "0.0.0.0" : "127.0.0.1";
const port = Number(process.env.PORT ?? 5173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Set PORT to an integer between 1 and 65535.");
}

if (dev) {
  if (!hosted) {
    const model = resolve("build/control-room-assets/control-room.glb");
    app.get("/control-room-assets/control-room.glb", (request, response) => {
      const original = statSync(model, { throwIfNoEntry: false });
      if (!original?.isFile()) {
        response.sendStatus(404);
        return;
      }
      response.vary("Accept-Encoding");
      response.set("Cross-Origin-Resource-Policy", "same-origin");
      response.set("Cache-Control", "private, no-cache");
      response.type("model/gltf-binary");
      const variants = new Map([["identity", model]]);
      if (!request.headers.range) {
        for (const [encoding, suffix] of [
          ["gzip", ".gz"],
          ["br", ".br"],
        ]) {
          const path = model + suffix;
          const variant = statSync(path, { throwIfNoEntry: false });
          if (variant?.isFile() && variant.mtimeMs >= original.mtimeMs)
            variants.set(encoding, path);
        }
      }
      const encoding = request.acceptsEncodings(
        ["br", "gzip", "identity"].filter((option) => variants.has(option)),
      );
      if (!encoding) {
        response.sendStatus(406);
        return;
      }
      if (encoding !== "identity") response.set("Content-Encoding", encoding);
      response.sendFile(variants.get(encoding)!, {
        acceptRanges: encoding === "identity",
      });
    });
  }
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
} else {
  const dist = resolve("dist");
  if (!existsSync(resolve(dist, "index.html")))
    throw new Error("Run npm run build before npm start.");
  app.use(express.static(dist));
  const limitPageFallback = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.get(
    ["/demo", "/login", "/review", "/settings"],
    limitPageFallback,
    (_request, response) => response.sendFile("index.html", { root: dist }),
  );
}

server.listen(port, host, () => {
  console.log(
    `Tactile ready at http://${host}:${port} (${provider ? "shared provider configured" : "per-session provider settings"})`,
  );
  if (auth) void initializeCrossfire();
});
