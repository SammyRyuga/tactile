import { randomUUID } from "node:crypto";
import express from "express";
import type { ErrorRequestHandler, Request, Response } from "express";
import { proposalSchema, reviewInputSchema } from "../shared/review.ts";
import type { ReviewEvent } from "../shared/review.ts";
import { extractClaims, ProposalScopeError, runReview } from "./pipeline.ts";
import type { PublicAuthConfig } from "./auth.ts";
import type { ReviewProvider } from "./provider.ts";

export function createApp(
  provider?: ReviewProvider,
  options: {
    auth?: PublicAuthConfig;
    verifySession?: (token: string) => Promise<string | null>;
    allowedHosts?: string[];
    reserveUsage?: (token: string) => Promise<boolean>;
    allowDevAssets?: boolean;
    trustProxy?: boolean;
    verifierModel?: string;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  let active = 0;
  const allowedHosts = options.allowedHosts ?? ["localhost", "127.0.0.1"];
  const accountUsage = new Map<string, number>();
  const preAuthUsage = new Map<string, number>();
  let windowEnds = 0;
  let preAuthEnds = 0;
  if (options.trustProxy) app.set("trust proxy", 1);

  const authOrigin = options.auth ? new URL(options.auth.url).origin : "";
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Permissions-Policy",
      "geolocation=(), camera=(), microphone=()",
    );
    if (!options.allowDevAssets)
      response.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ${authOrigin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
      );
    next();
  });

  app.get("/health", (_request, response) => response.json({ ok: true }));

  app.use("/api", (request, response, next) => {
    if (!allowedHosts.includes(request.hostname)) {
      response.status(403).json({ message: "Unrecognized API host." });
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Request-Id", randomUUID());
    next();
  });
  app.get("/api/status", (_request, response) =>
    response.json({ live: Boolean(provider) }),
  );
  app.get("/api/auth-config", (_request, response) =>
    response.json({ auth: options.auth ?? null }),
  );
  app.use("/api", express.json({ limit: "24kb" }));

  async function execute(
    request: Request,
    response: Response,
    run: (provider: ReviewProvider, signal: AbortSignal) => Promise<void>,
  ) {
    if (!request.is("application/json")) {
      response
        .status(415)
        .json({ message: "Expected an application/json request." });
      return;
    }
    if (!provider) {
      response.status(503).json({
        message:
          "Live review needs a provider key on the server. Try the bundled demo.",
      });
      return;
    }
    if (active >= 2) {
      response.status(429).json({
        message: "Two reviews are already in progress. Try again shortly.",
      });
      return;
    }
    if (options.verifySession) {
      const token = request.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) {
        response.status(401).json({ message: "Sign in to run a live review." });
        return;
      }
      const now = Date.now();
      if (now >= preAuthEnds) {
        preAuthEnds = now + 60_000;
        preAuthUsage.clear();
      }
      const address = request.ip ?? "unknown";
      const attempts = preAuthUsage.get(address) ?? 0;
      if (attempts >= 30 || (!attempts && preAuthUsage.size >= 2000)) {
        response
          .status(429)
          .json({ message: "Too many sign-in checks. Try again in a minute." });
        return;
      }
      preAuthUsage.set(address, attempts + 1);
      try {
        const accountId = await options.verifySession(token);
        if (response.destroyed) return;
        if (!accountId) {
          response
            .status(401)
            .json({ message: "Sign in to run a live review." });
          return;
        }
        if (active >= 2) {
          response
            .status(429)
            .json({ message: "Reviews are busy. Try again shortly." });
          return;
        }
        let allowed: boolean;
        if (options.reserveUsage) {
          allowed = await options.reserveUsage(token);
        } else {
          // A local allowance keeps the injected fixture usable without Supabase.
          if (now >= windowEnds) {
            windowEnds = now + 3_600_000;
            accountUsage.clear();
          }
          const count = accountUsage.get(accountId) ?? 0;
          allowed = count < 12;
          if (allowed) accountUsage.set(accountId, count + 1);
        }
        if (response.destroyed) return;
        if (!allowed) {
          response.status(429).json({
            message: "The hourly live review limit has been reached.",
          });
          return;
        }
        if (active >= 2) {
          response
            .status(429)
            .json({ message: "Reviews are busy. Try again shortly." });
          return;
        }
      } catch {
        response.status(503).json({
          message:
            "Sign-in or review quota verification is temporarily unavailable.",
        });
        return;
      }
    }
    const disconnected = new AbortController();
    const close = () => disconnected.abort();
    response.once("close", close);
    const signal = AbortSignal.any([
      disconnected.signal,
      AbortSignal.timeout(120_000),
    ]);
    active++;
    try {
      await run(provider, signal);
    } catch (error) {
      if (disconnected.signal.aborted) return;
      if (error instanceof ProposalScopeError) {
        response.status(422).json({ message: error.message });
        return;
      }
      console.info(
        JSON.stringify({
          event: "review_request_failed",
          requestId: response.getHeader("X-Request-Id"),
          errorType: error instanceof Error ? error.name : "unknown",
          timeout: signal.aborted,
        }),
      );
      const message = signal.aborted
        ? "The review timed out. Your inputs are ready to retry."
        : "The live provider could not complete the request. Try again or open the demo.";
      if (response.headersSent) {
        const event: ReviewEvent = { type: "error", message };
        response.end(JSON.stringify(event) + "\n");
      } else {
        response.status(signal.aborted ? 504 : 502).json({ message });
      }
    } finally {
      active--;
      response.off("close", close);
    }
  }

  app.post("/api/claims", (request, response) =>
    execute(request, response, async (client, signal) => {
      const parsed = proposalSchema.safeParse(request.body?.proposal);
      if (!parsed.success) {
        response.status(400).json({
          message:
            "Enter an engineering proposal between 20 and 3,000 characters.",
        });
        return;
      }
      const claims = await extractClaims(client, parsed.data, signal);
      signal.throwIfAborted();
      response.json({ claims });
    }),
  );

  app.post("/api/reviews", (request, response) =>
    execute(request, response, async (client, signal) => {
      const input = reviewInputSchema.safeParse(request.body);
      if (!input.success) {
        response.status(400).json({
          message: "Confirm between one and three distinct, non-empty claims.",
        });
        return;
      }
      response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();
      const emit = (event: ReviewEvent) => {
        if (!response.destroyed) response.write(JSON.stringify(event) + "\n");
      };
      const report = await runReview(client, input.data, emit, signal, {
        verifierModel: options.verifierModel,
        log: (entry) =>
          console.info(
            JSON.stringify({
              requestId: response.getHeader("X-Request-Id"),
              ...entry,
            }),
          ),
      });
      signal.throwIfAborted();
      emit({ type: "report", report });
      response.end();
    }),
  );

  app.use("/api", (_request, response) => {
    response.status(404).json({ message: "Unknown API route." });
  });
  const handleBodyError: ErrorRequestHandler = (
    error: { type?: string },
    _request,
    response,
    next,
  ) => {
    if (
      error.type === "entity.parse.failed" ||
      error.type === "entity.too.large"
    ) {
      response
        .status(error.type === "entity.too.large" ? 413 : 400)
        .json({ message: "Invalid or oversized JSON request." });
      return;
    }
    next(error);
  };
  app.use(handleBodyError);
  return app;
}
