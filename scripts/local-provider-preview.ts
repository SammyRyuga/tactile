// Standalone local sign-in fixture. The production application never imports it.
import { spawn } from "node:child_process";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { rateLimit } from "express-rate-limit";

if (process.env.RENDER === "true")
  throw new Error("The local sign-in fixture only runs on a workstation.");

const port = Number(process.env.PORT ?? 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose a local port between 1024 and 65535.");
const origin = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("base64url");
const signingKey = randomBytes(32);
const publishableKey = "tactile-loopback-preview";
const user = {
  id: randomUUID(),
  email: "preview@tactile.local",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: {},
  user_metadata: {},
  is_anonymous: false,
};
const durationSeconds = 8 * 60 * 60;
const sessions = new Map<string, number>();
const attempts: number[] = [];

const auth = express();
auth.use((request, response, next) => {
  response.set("Cache-Control", "no-store");
  if (request.get("Origin") && request.get("Origin") !== origin) {
    response.sendStatus(403);
    return;
  }
  response.set({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  if (request.method === "OPTIONS") response.sendStatus(204);
  else if (request.get("apikey") !== publishableKey) response.sendStatus(401);
  else next();
});
auth.use(express.json({ limit: "8kb" }));
auth.post(
  "/auth/v1/token",
  rateLimit({ windowMs: 60_000, limit: 8 }),
  (request, response) => {
    const supplied = Buffer.from(
      typeof request.body?.password === "string" ? request.body.password : "",
    );
    const expected = Buffer.from(password);
    if (
      request.query.grant_type !== "password" ||
      request.body?.email !== user.email ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      response.status(400).json({
        code: "invalid_credentials",
        msg: "Invalid local preview sign-in.",
      });
      return;
    }
    const exp = Math.floor(Date.now() / 1000) + durationSeconds;
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const payload =
      encode({ alg: "HS256", typ: "JWT" }) +
      "." +
      encode({
        sub: user.id,
        role: user.role,
        aud: user.aud,
        exp,
        session_id: randomUUID(),
      });
    const accessToken =
      payload +
      "." +
      createHmac("sha256", signingKey).update(payload).digest("base64url");
    sessions.set(accessToken, exp);
    setTimeout(
      () => sessions.delete(accessToken),
      durationSeconds * 1000,
    ).unref();
    response.json({
      access_token: accessToken,
      expires_in: durationSeconds,
      expires_at: exp,
      token_type: "bearer",
      refresh_token: randomBytes(24).toString("base64url"),
      user,
    });
  },
);
auth.use((request, response, next) => {
  const bearer = request.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  const expiry = bearer ? sessions.get(bearer) : undefined;
  if (!expiry || expiry <= Math.floor(Date.now() / 1000)) {
    response
      .status(401)
      .json({ code: "session_not_found", msg: "Sign in again." });
    return;
  }
  response.locals.token = bearer;
  next();
});
auth.get("/auth/v1/user", (_request, response) => response.json(user));
auth.post("/auth/v1/logout", (_request, response) => {
  sessions.delete(response.locals.token);
  response.sendStatus(204);
});
auth.post("/rest/v1/rpc/reserve_tactile_review", (_request, response) => {
  const now = Date.now();
  while (attempts[0] !== undefined && attempts[0] <= now - 60 * 60 * 1000)
    attempts.shift();
  const allowed = attempts.length < 12;
  if (allowed) attempts.push(now);
  response.json(allowed);
});

const authServer = auth.listen(0, "127.0.0.1");
await once(authServer, "listening");
const address = authServer.address();
if (!address || typeof address === "string")
  throw new Error("Local sign-in failed to start.");
const directory = await mkdtemp(join(tmpdir(), "tactile-local-signin-"));
const signInFile = join(directory, "signin.txt");
await writeFile(signInFile, `Email: ${user.email}\nPassword: ${password}\n`, {
  mode: 0o600,
  flag: "wx",
});
console.log("Local preview sign-in file:", signInFile);
const child = spawn(process.execPath, ["server/index.ts", "--dev"], {
  env: {
    ...process.env,
    PORT: String(port),
    RENDER: "false",
    OPENAI_API_KEY: "",
    SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  },
  stdio: "inherit",
  windowsHide: true,
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => child.kill(signal));
const [code] = await once(child, "exit");
authServer.closeAllConnections();
authServer.close();
process.exitCode = code ?? 1;
