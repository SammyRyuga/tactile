import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
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
const app = createApp(provider, {
  auth,
  verifySession: auth ? createSessionVerifier(auth) : undefined,
  reserveUsage: auth ? (token) => reserveReview(auth, token) : undefined,
  revision: hosted ? process.env.RENDER_GIT_COMMIT : undefined,
  allowedHosts: [
    ...(hostname ? [hostname] : ["localhost", "127.0.0.1"]),
    ...allowedHosts,
  ],
  allowDevAssets: dev,
  trustProxy: hosted,
  verifierModel: process.env.OPENAI_VERIFIER_MODEL?.trim() || undefined,
  metaVerifierModel: process.env.META_VERIFIER_MODEL?.trim() || undefined,
});
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
  app.get(["/demo", "/login", "/review", "/settings"], (_request, response) =>
    response.sendFile("index.html", { root: dist }),
  );
}

server.listen(port, host, () =>
  console.log(
    `Tactile ready at http://${host}:${port} (${provider ? "shared provider configured" : "per-session provider settings"})`,
  ),
);
