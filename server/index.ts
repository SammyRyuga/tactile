import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./app.ts";
import { createProvider } from "./provider.ts";

const key = process.env.OPENAI_API_KEY?.trim();
const provider = key
  ? createProvider(key, process.env.OPENAI_MODEL?.trim() || "gpt-5-mini")
  : undefined;
const app = createApp(provider);
const server = createServer(app);
const host = "127.0.0.1";
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
}

server.listen(port, host, () =>
  console.log(
    `Tactile ready at http://${host}:${port} (${provider ? "live and demo" : "demo"})`,
  ),
);
