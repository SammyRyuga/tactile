import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app.ts";
import { createSessionVerifier } from "./auth.ts";
import { createProvider } from "./provider.ts";

const key = process.env.OPENAI_API_KEY?.trim();
const provider = key
  ? createProvider(key, process.env.OPENAI_MODEL?.trim() || "gpt-5-mini")
  : undefined;
const hosted = process.env.RENDER === "true";
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const auth =
  supabaseUrl && publishableKey
    ? { url: supabaseUrl, publishableKey }
    : undefined;
const hostname = process.env.RENDER_EXTERNAL_HOSTNAME;
const app = createApp(hosted && !auth ? undefined : provider, {
  auth,
  verifySession: auth ? createSessionVerifier(auth) : undefined,
  allowedHosts: hostname ? [hostname] : ["localhost", "127.0.0.1"],
});
const server = createServer(app);
const host = hosted ? "0.0.0.0" : "127.0.0.1";
const port = Number(process.env.PORT ?? 5173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Set PORT to an integer between 1 and 65535.");
}

if (process.argv.includes("--dev")) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
} else {
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  if (!existsSync(dist + "index.html"))
    throw new Error("Run npm run build before npm start.");
  app.use(express.static(dist));
  app.get(["/login", "/review"], (_request, response) =>
    response.sendFile("index.html", { root: dist }),
  );
}

server.listen(port, host, () =>
  console.log(
    `Tactile ready at http://${host}:${port} (${provider ? "live and demo" : "demo"})`,
  ),
);
