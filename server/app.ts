import { randomUUID } from "node:crypto";
import express from "express";
import type { ErrorRequestHandler, Request, Response } from "express";
import { proposalSchema, reviewInputSchema } from "../shared/review.ts";
import type { ReviewEvent } from "../shared/review.ts";
import { extractClaims, ProposalScopeError, runReview } from "./pipeline.ts";
import type { PublicAuthConfig } from "./auth.ts";
import {
  createProviderSettings,
  personalKeySchema,
  providerSessionId,
  validateMetaKey,
} from "./provider-settings.ts";
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
    metaVerifierModel?: string;
    metaRequest?: typeof fetch;
    sourceReader?: NonNullable<Parameters<typeof runReview>[4]>["sourceReader"];
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  let active = 0;
  const validatingKeys = new Map<string, AbortController>();
  const maxConcurrentKeyValidations = 32;
  const settings = createProviderSettings(options.metaVerifierModel);
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
  app.get("/api/auth-config", (_request, response) =>
    response.json({ auth: options.auth ?? null }),
  );
  app.use("/api", express.json({ limit: "80kb" }));

  async function requireSession(request: Request, response: Response) {
    const token = request.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!options.verifySession || !token) {
      response.status(401).json({ message: "Sign in to use Tactile." });
      return undefined;
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
      return undefined;
    }
    preAuthUsage.set(address, attempts + 1);
    try {
      const account = await options.verifySession(token);
      if (response.destroyed) return undefined;
      if (!account) {
        response.status(401).json({ message: "Sign in to use Tactile." });
        return undefined;
      }
      return { account, token };
    } catch {
      response
        .status(503)
        .json({ message: "Sign-in verification is temporarily unavailable." });
      return undefined;
    }
  }

  app.get("/api/status", async (request, response) => {
    if (!request.get("Authorization")) {
      response.json({ live: Boolean(provider) });
      return;
    }
    const session = await requireSession(request, response);
    if (!session) return;
    response.json({
      live: Boolean(settings.get(session.account, session.token) || provider),
    });
  });
  app.get("/api/settings/provider", async (request, response) => {
    const session = await requireSession(request, response);
    if (!session) return;
    const stored = settings.get(session.account, session.token);
    response.json({ saved: Boolean(stored), expiresAt: stored?.expiresAt });
  });
  app.post("/api/settings/provider", async (request, response) => {
    const session = await requireSession(request, response);
    if (!session) return;
    const parsed = personalKeySchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ message: "Enter a valid Meta Model API key." });
      return;
    }
    const id = providerSessionId(session.account, session.token);
    if (!id) {
      response
        .status(401)
        .json({ message: "Sign in again before saving a provider key." });
      return;
    }
    if (validatingKeys.has(id)) {
      response.status(429).json({
        message: "A key validation is already in progress. Try again shortly.",
      });
      return;
    }
    if (validatingKeys.size >= maxConcurrentKeyValidations) {
      response
        .status(429)
        .json({ message: "Key validation is busy. Try again shortly." });
      return;
    }
    const controller = new AbortController();
    const stop = () => controller.abort();
    response.once("close", stop);
    validatingKeys.set(id, controller);
    let status: number;
    try {
      status = await validateMetaKey(
        parsed.data.key,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        options.metaRequest,
      );
    } catch {
      status = 503;
    } finally {
      validatingKeys.delete(id);
      response.off("close", stop);
    }
    if (response.destroyed) return;
    if (controller.signal.aborted) {
      response
        .status(409)
        .json({ message: "The key validation was canceled." });
      return;
    }
    if (status === 400) {
      console.info(
        JSON.stringify({
          event: "meta_key_validation_request_rejected",
          requestId: response.getHeader("X-Request-Id"),
          upstreamStatus: status,
        }),
      );
      response.status(502).json({
        message:
          "Meta declined the validation request. Your key could not be checked. Try again shortly.",
      });
      return;
    }
    if (status !== 200) {
      const rejected = [401, 403, 404].includes(status);
      const quota = [402, 429].includes(status);
      response.status(rejected ? 422 : quota ? 429 : 503).json({
        message: rejected
          ? "Meta rejected this key or it cannot access Muse Spark. Check the key and try again."
          : quota
            ? "Meta could not run the validation. Check your usage limits or billing and try again."
            : "Meta key validation is temporarily unavailable. Try again shortly.",
      });
      return;
    }
    const expiresAt = settings.save(
      session.account,
      session.token,
      parsed.data.key,
    );
    if (!expiresAt) {
      response
        .status(503)
        .json({ message: "The key could not be saved for this session." });
      return;
    }
    response.status(201).json({ saved: true, expiresAt });
  });
  app.delete("/api/settings/provider", async (request, response) => {
    const session = await requireSession(request, response);
    if (!session) return;
    const id = providerSessionId(session.account, session.token);
    if (id) validatingKeys.get(id)?.abort();
    settings.clear(session.account, session.token);
    response.json({ saved: false });
  });

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
    let client = provider;
    if (options.verifySession) {
      const session = await requireSession(request, response);
      if (!session) return;
      client = settings.provider(session.account, session.token) ?? provider;
      if (!client) {
        response.status(409).json({
          message:
            "Add a Meta Model API key in Settings to extract claims or run a live review.",
        });
        return;
      }
      if (active >= 2) {
        response
          .status(429)
          .json({ message: "Reviews are busy. Try again shortly." });
        return;
      }
      try {
        let allowed: boolean;
        if (options.reserveUsage) {
          allowed = await options.reserveUsage(session.token);
        } else {
          const now = Date.now();
          if (now >= windowEnds) {
            windowEnds = now + 3_600_000;
            accountUsage.clear();
          }
          const count = accountUsage.get(session.account) ?? 0;
          allowed = count < 12;
          if (allowed) accountUsage.set(session.account, count + 1);
        }
        if (response.destroyed) return;
        if (!allowed) {
          response.status(429).json({
            message: "The hourly live review limit has been reached.",
          });
          return;
        }
      } catch {
        response.status(503).json({
          message: "Review quota verification is temporarily unavailable.",
        });
        return;
      }
    }
    if (!client) {
      response
        .status(503)
        .json({ message: "Live reviews require a provider key." });
      return;
    }
    if (active >= 2) {
      response
        .status(429)
        .json({ message: "Reviews are busy. Try again shortly." });
      return;
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
      await run(client, signal);
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
        : "The live provider could not complete the request. Check your key and try again.";
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
        sourceReader: options.sourceReader,
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
