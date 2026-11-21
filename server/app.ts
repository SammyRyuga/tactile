import { demoExamples } from "../shared/demo.ts";
import { defaultReviewModel } from "../shared/models.ts";
import { randomUUID } from "node:crypto";
import express from "express";
import { rateLimit } from "express-rate-limit";
import type { ErrorRequestHandler, Request, Response } from "express";
import {
  attachmentKindSchema,
  limits,
  proposalIntakeSchema,
  proposalRevisionSchema,
  reviewInputSchema,
} from "../shared/review.ts";
import type { ReviewEvent } from "../shared/review.ts";
import { extractClaims, ProposalScopeError, runReview } from "./pipeline.ts";
import { CrossfireClarification } from "./crossfire-engine.ts";
import type { createCrossfireEngine } from "./crossfire-engine.ts";
import { readSource } from "./source-reader.ts";
import { z } from "zod";
import type { PublicAuthConfig } from "./auth.ts";
import {
  createProviderSettings,
  personalKeySchema,
  providerSessionId,
  validateMetaKey,
} from "./provider-settings.ts";
import type { ClaimCache } from "./provider-settings.ts";
import type { ReviewProvider } from "./provider.ts";
import { ProviderResponseError } from "./provider.ts";

function providerFailure(error: unknown, timedOut: boolean) {
  if (timedOut || (error instanceof Error && error.name === "TimeoutError"))
    return {
      status: 504,
      message:
        "The provider request timed out. Your inputs are ready to retry.",
    };
  if (error instanceof ProviderResponseError) {
    if ([402, 429].includes(error.status))
      return {
        status: 429,
        message:
          "The provider reached a usage or billing limit. Check provider usage and try again.",
      };
    if ([401, 403].includes(error.status))
      return {
        status: 502,
        message:
          "The provider rejected the configured key or model access. Check Settings and try again.",
      };
  }
  return {
    status: 503,
    message:
      "The live provider is temporarily unavailable. Try again shortly. Your inputs are ready to retry.",
  };
}

export function createApp(
  provider?: ReviewProvider,
  options: {
    auth?: PublicAuthConfig;
    verifySession?: (token: string) => Promise<string | null>;
    allowedHosts?: string[];
    reserveUsage?: (token: string) => Promise<boolean>;
    revision?: string;
    allowDevAssets?: boolean;
    trustProxy?: boolean;
    verifierModel?: string;
    metaVerifierModel?: string;
    metaRequest?: typeof fetch;
    sourceReader?: NonNullable<Parameters<typeof runReview>[4]>["sourceReader"];
    crossfire?: ReturnType<typeof createCrossfireEngine>;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  let active = 0;
  let importing = false;
  const validatingKeys = new Map<string, AbortController>();
  const maxConcurrentKeyValidations = 32;
  const settings = createProviderSettings(
    options.metaVerifierModel,
    options.metaRequest,
  );
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

  const revision = /^[a-f0-9]{40}$/i.test(options.revision ?? "")
    ? options.revision
    : undefined;
  app.get("/health", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({ ok: true, revision });
  });

  app.use("/api", (request, response, next) => {
    if (!allowedHosts.includes(request.hostname)) {
      response.status(403).json({ message: "Unrecognized API host." });
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Request-Id", randomUUID());
    next();
  });
  if (options.auth) {
    app.get("/demo", (request, response) => {
      const example = demoExamples.find(
        ({ id }) => id === request.query.example,
      );
      response.redirect(302, `/review?example=${example?.id ?? "flag"}`);
    });
  }
  app.get("/api/auth-config", (_request, response) =>
    response.json({ auth: options.auth ?? null }),
  );
  const limitImports = rateLimit({
    windowMs: 60_000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message: "Too many attachment requests. Try again in a minute.",
    },
  });
  app.post(
    "/api/ingest/file/:kind",
    limitImports,
    async (request, response, next) => {
      const session = await requireSession(request, response);
      if (!session) return;
      const kind = attachmentKindSchema.safeParse(request.params.kind);
      if (!kind.success || !request.is("application/octet-stream")) {
        response
          .status(415)
          .json({ message: "Upload a PDF or a supported image." });
        return;
      }
      response.locals.attachment = { session, kind: kind.data };
      next();
    },
    express.raw({
      type: "application/octet-stream",
      limit: limits.attachmentBytes,
      inflate: false,
    }),
    async (request, response) => {
      const engine = options.crossfire;
      if (!engine) {
        response
          .status(503)
          .json({ message: "File extraction is temporarily unavailable." });
        return;
      }
      const data: unknown = request.body;
      if (!Buffer.isBuffer(data) || !data.length) {
        response
          .status(400)
          .json({ message: "Choose a non-empty file to upload." });
        return;
      }
      const { kind, session } = response.locals.attachment as {
        kind: z.infer<typeof attachmentKindSchema>;
        session: { account: string; token: string };
      };
      await importContent(response, session, (signal) =>
        engine.ingest(kind, data, signal),
      );
    },
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
    response.json({
      saved: Boolean(stored),
      expiresAt: stored?.expiresAt,
      model: stored?.model ?? defaultReviewModel,
    });
  });
  app.post("/api/settings/provider", async (request, response) => {
    const session = await requireSession(request, response);
    if (!session) return;
    const parsed = personalKeySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        message: "Choose a review model and check your Meta API key.",
      });
      return;
    }
    const id = providerSessionId(session.account, session.token);
    if (!id) {
      response
        .status(401)
        .json({ message: "Sign in again before saving a provider key." });
      return;
    }
    const stored = settings.get(session.account, session.token);
    const key = parsed.data.key ?? stored?.key;
    if (!key) {
      response
        .status(400)
        .json({ message: "Enter your Meta Model API key to save this model." });
      return;
    }
    const model = parsed.data.model ?? stored?.model ?? defaultReviewModel;
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
        key,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        options.metaRequest,
        model,
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
          ? "Meta rejected the key or your account cannot use this model. Check your key or choose another model."
          : quota
            ? "Meta could not run the validation. Check your usage limits or billing and try again."
            : "Meta key validation is temporarily unavailable. Try again shortly.",
      });
      return;
    }
    const expiresAt = settings.save(
      session.account,
      session.token,
      key,
      model,
      parsed.data.key ? undefined : stored?.expiresAt,
    );
    if (!expiresAt) {
      response
        .status(503)
        .json({ message: "The key could not be saved for this session." });
      return;
    }
    response
      .status(parsed.data.key ? 201 : 200)
      .json({ saved: true, expiresAt, model });
  });
  app.delete("/api/settings/provider", async (request, response) => {
    const session = await requireSession(request, response);
    if (!session) return;
    const id = providerSessionId(session.account, session.token);
    if (id) validatingKeys.get(id)?.abort();
    settings.clear(session.account, session.token);
    response.json({ saved: false });
  });

  async function reserveQuota(session: { account: string; token: string }) {
    if (options.reserveUsage) return options.reserveUsage(session.token);
    const now = Date.now();
    if (now >= windowEnds) {
      windowEnds = now + 3_600_000;
      accountUsage.clear();
    }
    const count = accountUsage.get(session.account) ?? 0;
    if (count >= 12) return false;
    accountUsage.set(session.account, count + 1);
    return true;
  }

  async function importContent(
    response: Response,
    session: { account: string; token: string },
    read: (signal: AbortSignal) => Promise<string | undefined>,
  ) {
    if (importing) {
      response.status(429).json({
        message: "Another document is being read. Try again shortly.",
      });
      return;
    }
    const disconnected = new AbortController();
    const abort = () => disconnected.abort();
    const timeout = AbortSignal.timeout(40_000);
    response.once("close", abort);
    importing = true;
    try {
      if (!(await reserveQuota(session))) {
        response
          .status(429)
          .json({ message: "The hourly request limit has been reached." });
        return;
      }
      const text = (
        await read(AbortSignal.any([timeout, disconnected.signal]))
      )?.trim();
      if (disconnected.signal.aborted) return;
      if (!text || text.length < 12) {
        response.status(422).json({
          message:
            "There was no readable text. Try a public content page, a clear screenshot, or a PDF of up to 15 pages.",
        });
        return;
      }
      response.json({
        text: text.slice(0, limits.evidenceText),
        truncated: text.length > limits.evidenceText,
      });
    } catch {
      if (!disconnected.signal.aborted)
        response.status(timeout.aborted ? 504 : 503).json({
          message: timeout.aborted
            ? "Reading the attachment took too long. Try a smaller file or paste its text."
            : "Attachment reading is temporarily unavailable. Try again shortly.",
        });
    } finally {
      importing = false;
      response.off("close", abort);
    }
  }

  app.post("/api/ingest/url", limitImports, async (request, response) => {
    const session = await requireSession(request, response);
    if (!session) return;
    const input = z
      .object({ url: z.string().trim().min(1).max(2048) })
      .safeParse(request.body);
    const url = input.success ? URL.parse(input.data.url) : null;
    if (!url || url.protocol !== "https:") {
      response.status(400).json({ message: "Enter a public HTTPS page link." });
      return;
    }
    await importContent(response, session, async (signal) => {
      const result = await (options.sourceReader ?? readSource)(
        url.href,
        signal,
      );
      return typeof result === "string" ? result : result?.text;
    });
  });

  async function execute(
    request: Request,
    response: Response,
    run: (
      provider: ReviewProvider,
      signal: AbortSignal,
      cache?: ClaimCache,
    ) => Promise<void>,
  ) {
    if (!request.is("application/json")) {
      response
        .status(415)
        .json({ message: "Expected an application/json request." });
      return;
    }
    const session = options.verifySession
      ? await requireSession(request, response)
      : undefined;
    if (options.verifySession && !session) return;
    const cache =
      session && settings.get(session.account, session.token)?.claims;
    const client =
      (session &&
        settings.provider(session.account, session.token, (usage) => {
          if (usage.inputTokens === null) return;
          console.info(
            JSON.stringify({
              event: "provider_token_usage",
              requestId: response.getHeader("X-Request-Id"),
              ...usage,
            }),
          );
        })) ??
      provider;
    if (!client) {
      response.status(session ? 409 : 503).json({
        message: session
          ? "Add a Meta Model API key in Settings to extract claims or run a live review."
          : "Live reviews require a provider key.",
      });
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
      if (session) {
        try {
          const allowed = await reserveQuota(session);
          if (response.destroyed) return;
          if (!allowed) {
            response.status(429).json({
              message: "The hourly live review limit has been reached.",
            });
            return;
          }
        } catch {
          if (!response.destroyed)
            response.status(503).json({
              message: "Review quota verification is temporarily unavailable.",
            });
          return;
        }
      }
      signal.throwIfAborted();
      await run(client, signal, cache);
    } catch (error) {
      if (disconnected.signal.aborted) return;
      if (error instanceof CrossfireClarification) {
        response
          .status(422)
          .json({ message: error.message, clarification: error.details });
        return;
      }
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
      const { status, message } = providerFailure(error, signal.aborted);
      if (response.headersSent) {
        const event: ReviewEvent = { type: "error", message };
        response.end(JSON.stringify(event) + "\n");
      } else {
        response.status(status).json({ message });
      }
    } finally {
      active--;
      response.off("close", close);
    }
  }

  app.post("/api/claims", (request, response) =>
    execute(request, response, async (client, signal, cache) => {
      const parsed = proposalIntakeSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          message:
            "Enter an engineering proposal between 20 and 3,000 characters.",
        });
        return;
      }
      const { proposal, ...context } = parsed.data;
      const cacheKey = JSON.stringify(parsed.data);
      const cached = cache?.get(cacheKey);
      if (cached) {
        console.info(
          JSON.stringify({
            event: "claim_cache_hit",
            requestId: response.getHeader("X-Request-Id"),
          }),
        );
        response.json({ claims: cached });
        return;
      }
      const claims = options.crossfire
        ? await options.crossfire.extract(client, proposal, signal, context)
        : await extractClaims(client, proposal, signal);
      signal.throwIfAborted();
      cache?.add(cacheKey, claims);
      response.json({ claims });
    }),
  );

  app.post("/api/revisions", (request, response) =>
    execute(request, response, async (client, signal) => {
      const input = proposalRevisionSchema.safeParse(request.body);
      if (!input.success) {
        response.status(400).json({
          message: "Choose at least one suggested change to revise the plan.",
        });
        return;
      }
      if (!options.crossfire) {
        response
          .status(503)
          .json({ message: "Plan revision is temporarily unavailable." });
        return;
      }
      const revision = await options.crossfire.revise(
        client,
        input.data,
        signal,
      );
      signal.throwIfAborted();
      response.json(revision);
    }),
  );

  app.post("/api/reviews", (request, response) =>
    execute(request, response, async (client, signal) => {
      const input = reviewInputSchema.safeParse(request.body);
      if (!input.success) {
        response.status(400).json({
          message:
            "Select at least one claim. Include only distinct claims with text.",
        });
        return;
      }
      response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();
      const emit = (event: ReviewEvent) => {
        if (!response.destroyed) response.write(JSON.stringify(event) + "\n");
      };
      const report = options.crossfire
        ? await options.crossfire.review(client, input.data, emit, signal)
        : await runReview(client, input.data, emit, signal, {
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
    request,
    response,
    next,
  ) => {
    if (
      request.path.startsWith("/api/ingest/file/") &&
      ["entity.too.large", "encoding.unsupported"].includes(error.type ?? "")
    ) {
      response.status(error.type === "entity.too.large" ? 413 : 415).json({
        message:
          error.type === "entity.too.large"
            ? "Upload a file of 4 MB or less."
            : "Upload the original file without compression.",
      });
      return;
    }
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
