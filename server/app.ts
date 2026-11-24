import { defaultReviewModel } from "../shared/models.ts";
import { randomUUID } from "node:crypto";
import express from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { isIP } from "node:net";
import type { ErrorRequestHandler, Request, Response } from "express";
import {
  attachmentKindSchema,
  claimListSchema,
  limits,
  matchesLiveReview,
  proposalIntakeSchema,
  proposalRevisionSchema,
  reviewInputSchema,
} from "../shared/review.ts";
import type { ReviewEvent } from "../shared/review.ts";
import { extractClaims, ProposalScopeError, runReview } from "./pipeline.ts";
import {
  CrossfireClarification,
  CrossfireRuntimeError,
} from "./crossfire-engine.ts";
import type { createCrossfireEngine } from "./crossfire-engine.ts";
import { readSource } from "./source-reader.ts";
import { z } from "zod";
import type { PublicAuthConfig } from "./auth.ts";
import {
  createProviderSettings,
  MetaModelLookupError,
  personalKeySchema,
  providerSessionId,
  testMetaGeneration,
  validateMetaKey,
} from "./provider-settings.ts";
import type { ClaimCache } from "./provider-settings.ts";
import type { ReviewProvider } from "./provider.ts";
import {
  MetaResponsesNotFound,
  ProviderOutputError,
  ProviderResponseError,
} from "./provider.ts";

function providerFailure(
  error: unknown,
  timedOut: boolean,
  validation = false,
) {
  if (timedOut || (error instanceof Error && error.name === "TimeoutError"))
    return {
      status: 504,
      code: "provider_timeout",
      message: validation
        ? "Meta did not respond in time. Try saving again."
        : "The provider request timed out. Your inputs are ready to retry.",
    };
  if (error instanceof CrossfireRuntimeError)
    return {
      status: 503,
      code: "review_engine",
      message:
        "The live review engine could not complete the request. Your inputs are ready to retry.",
    };
  if (
    validation &&
    error instanceof MetaModelLookupError &&
    !error.confirmedMissing
  )
    return {
      status: 503,
      code: "provider_catalog",
      message:
        "Meta’s model information was inconclusive. You can retry the save or explicitly test the selected model.",
    };
  if (error instanceof MetaResponsesNotFound)
    return {
      status: 502,
      code: "provider_endpoint",
      message:
        "Meta’s generation endpoint could not complete the request. Share the request ID if this continues.",
    };
  if (error instanceof ProviderOutputError)
    return {
      status: 502,
      code:
        error.outcome === "incomplete"
          ? "provider_incomplete"
          : "provider_response",
      message:
        error.outcome === "incomplete"
          ? "The provider did not finish generating a response. Your inputs are ready to try again."
          : "The provider returned an unexpected response. Share the request ID if this continues.",
    };
  if (error instanceof ProviderResponseError) {
    const retryAfter = error.retryAfter;
    switch (error.status) {
      case 0:
        return {
          status: 503,
          code: "provider_network",
          message:
            "Tactile could not connect to the provider. Try again shortly.",
        };
      case 400:
        return {
          status: 502,
          code: "provider_request",
          message: validation
            ? "Meta declined the validation request. Share the request ID if this continues."
            : "The provider declined the review request. Share the request ID so the integration can be checked.",
        };
      case 401:
        return {
          status: validation ? 422 : 502,
          code: "provider_key",
          message:
            "The provider did not accept this key. Check that it was copied from the Model API dashboard and has not been revoked.",
        };
      case 403:
        return {
          status: validation ? 422 : 502,
          code: "provider_permission",
          message:
            "The provider denied permission. Check the key’s team permissions or select another model in Settings.",
        };
      case 404:
        return {
          status: validation ? 422 : 502,
          code: "provider_model",
          message:
            "The selected model is unavailable to this key. Choose another model or check access in the provider dashboard.",
        };
      case 402:
        return {
          status: 429,
          code: "provider_billing",
          retryAfter,
          message:
            "The provider reached a usage or billing limit. Check billing in the provider dashboard.",
        };
      case 429:
        return {
          status: 429,
          code: "provider_rate_limit",
          retryAfter,
          message:
            "The provider reached a usage or billing limit. Wait before trying again and check provider usage if it persists.",
        };
      default:
        return {
          status: 503,
          code: "provider_unavailable",
          retryAfter,
          message:
            "The provider returned an unavailable or unexpected response. Try again shortly.",
        };
    }
  }
  return {
    status: 503,
    code: "review_unavailable",
    message:
      "The live review is temporarily unavailable. Try again shortly. Your inputs are ready to retry.",
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
    trustProxy?: boolean | ((address: string, hop: number) => boolean);
    verifierModel?: string;
    metaRequest?: typeof fetch;
    sourceReader?: NonNullable<Parameters<typeof runReview>[4]>["sourceReader"];
    crossfire?: ReturnType<typeof createCrossfireEngine>;
    crossfireUnavailable?: boolean;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  let active = 0;
  let importing = false;
  const validatingKeys = new Map<string, AbortController>();
  const maxConcurrentKeyValidations = 32;
  const settings = createProviderSettings(options.metaRequest);
  const allowedHosts = options.allowedHosts ?? ["localhost", "127.0.0.1"];
  const accountUsage = new Map<string, number>();
  const preAuthUsage = new Map<string, number>();
  let windowEnds = 0;
  let preAuthEnds = 0;
  if (options.trustProxy)
    app.set(
      "trust proxy",
      options.trustProxy === true ? 1 : options.trustProxy,
    );

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
    const host = request
      .get("Host")
      ?.match(/^([a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d+)?$/i)?.[1]
      .toLowerCase();
    if (!host || !allowedHosts.includes(host)) {
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

  const limitProviderSettings = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message:
        "Too many status or provider settings requests. Try again in a minute.",
    },
  });

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
    const address =
      request.ip && isIP(request.ip) ? ipKeyGenerator(request.ip) : "unknown";
    const attempts = preAuthUsage.get(address) ?? 0;
    if (attempts >= 30 || (!attempts && preAuthUsage.size >= 2000)) {
      response
        .status(429)
        .set("Retry-After", String(Math.ceil((preAuthEnds - now) / 1000)))
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

  app.get("/api/status", limitProviderSettings, async (request, response) => {
    if (!request.get("Authorization")) {
      response.json({ live: Boolean(provider) });
      return;
    }
    const session = await requireSession(request, response);
    if (!session) return;
    response.json({
      live: Boolean(settings.get(session.account, session.token) || provider),
      ...(options.auth ? { workerReady: Boolean(options.crossfire) } : {}),
    });
  });
  app.get(
    "/api/settings/provider",
    limitProviderSettings,
    async (request, response) => {
      const session = await requireSession(request, response);
      if (!session) return;
      const stored = settings.get(session.account, session.token);
      response.json({
        saved: Boolean(stored),
        expiresAt: stored?.expiresAt,
        model: stored?.model ?? defaultReviewModel,
      });
    },
  );
  app.post(
    "/api/settings/provider",
    limitProviderSettings,
    async (request, response) => {
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
        response.status(400).json({
          message: "Enter your Meta Model API key to save this model.",
        });
        return;
      }
      const model = parsed.data.model ?? stored?.model ?? defaultReviewModel;
      const testGeneration = parsed.data.verification === "generation";
      if (testGeneration && options.crossfireUnavailable) {
        response.status(503).json({
          code: "review_engine",
          message:
            "The live review engine is unavailable on this deployment. Contact the deployment owner.",
        });
        return;
      }
      let verification: "metadata" | "generation" = "metadata";
      if (validatingKeys.has(id)) {
        response.status(429).json({
          message:
            "A key validation is already in progress. Try again shortly.",
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
      const deadline = AbortSignal.timeout(15_000);
      try {
        const signal = AbortSignal.any([controller.signal, deadline]);
        let catalogFallback: Awaited<ReturnType<typeof validateMetaKey>>;
        try {
          catalogFallback = await validateMetaKey(
            key,
            model,
            signal,
            options.metaRequest,
          );
        } catch (error) {
          if (
            !testGeneration ||
            !(error instanceof MetaModelLookupError) ||
            error.confirmedMissing
          )
            throw error;
          signal.throwIfAborted();
          verification = "generation";
          await testMetaGeneration(key, model, signal, options.metaRequest);
          catalogFallback = error.catalogOutcome;
        }
        if (catalogFallback)
          console.info(
            JSON.stringify({
              event: "meta_key_validation_model_lookup",
              requestId: response.getHeader("X-Request-Id"),
              model,
              catalogOutcome: catalogFallback,
              verification,
            }),
          );
      } catch (error) {
        if (response.destroyed) return;
        if (controller.signal.aborted) {
          response
            .status(409)
            .json({ message: "The key validation was canceled." });
          return;
        }
        const { status, code, message, retryAfter } = providerFailure(
          error,
          deadline.aborted,
          true,
        );
        const upstreamStatus =
          error instanceof ProviderResponseError && error.status > 0
            ? error.status
            : undefined;
        console.info(
          JSON.stringify({
            event: "meta_key_validation_failed",
            requestId: response.getHeader("X-Request-Id"),
            code,
            model,
            verification,
            catalogOutcome:
              error instanceof MetaModelLookupError
                ? error.catalogOutcome
                : undefined,
            upstreamStatus,
          }),
        );
        if (retryAfter) response.set("Retry-After", retryAfter);
        response.status(status).json({ code, message, upstreamStatus });
        return;
      } finally {
        validatingKeys.delete(id);
        response.off("close", stop);
      }
      if (response.destroyed || controller.signal.aborted) return;
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
      response.status(parsed.data.key ? 201 : 200).json({
        saved: true,
        expiresAt,
        model,
        ...(verification === "generation" ? { verification } : {}),
      });
    },
  );
  app.delete(
    "/api/settings/provider",
    limitProviderSettings,
    async (request, response) => {
      const session = await requireSession(request, response);
      if (!session) return;
      const id = providerSessionId(session.account, session.token);
      if (id) validatingKeys.get(id)?.abort();
      settings.clear(session.account, session.token);
      response.json({ saved: false });
    },
  );

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

  async function execute<T>(
    request: Request,
    response: Response,
    schema: z.ZodType<T>,
    invalidMessage: string,
    run: (
      provider: ReviewProvider,
      signal: AbortSignal,
      input: T,
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
    const input = schema.safeParse(request.body);
    if (!input.success) {
      response.status(400).json({ message: invalidMessage });
      return;
    }
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
    if (options.crossfireUnavailable) {
      response.status(503).json({
        code: "review_engine",
        message:
          "The live review engine is unavailable on this deployment. Contact the deployment owner.",
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
      await run(client, signal, input.data, cache);
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
      const { status, code, message, retryAfter } = providerFailure(
        error,
        signal.aborted,
      );
      const upstreamStatus =
        error instanceof ProviderResponseError && error.status > 0
          ? error.status
          : undefined;
      console.info(
        JSON.stringify({
          event: "review_request_failed",
          requestId: response.getHeader("X-Request-Id"),
          code,
          upstreamStatus,
        }),
      );
      if (response.headersSent) {
        const event: ReviewEvent = {
          type: "error",
          message,
          retryAfter,
          code,
          upstreamStatus,
        };
        response.end(JSON.stringify(event) + "\n");
      } else {
        if (retryAfter) response.set("Retry-After", retryAfter);
        response.status(status).json({ code, message, upstreamStatus });
      }
    } finally {
      active--;
      response.off("close", close);
    }
  }

  app.post("/api/claims", (request, response) =>
    execute(
      request,
      response,
      proposalIntakeSchema,
      "Enter an engineering proposal between 20 and 3,000 characters.",
      async (client, signal, input, cache) => {
        const { proposal, ...context } = input;
        const cacheKey = JSON.stringify(input);
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
        const validated = claimListSchema.safeParse(claims);
        if (!validated.success) throw new ProviderOutputError("malformed");
        cache?.add(cacheKey, validated.data);
        response.json({ claims: validated.data });
      },
    ),
  );

  app.post("/api/revisions", (request, response) =>
    execute(
      request,
      response,
      proposalRevisionSchema,
      "Choose at least one suggested change to revise the plan.",
      async (client, signal, input) => {
        if (!options.crossfire) {
          response
            .status(503)
            .json({ message: "Plan revision is temporarily unavailable." });
          return;
        }
        const revision = await options.crossfire.revise(client, input, signal);
        signal.throwIfAborted();
        response.json(revision);
      },
    ),
  );

  app.post("/api/reviews", (request, response) =>
    execute(
      request,
      response,
      reviewInputSchema,
      "Select at least one claim. Include only distinct claims with text.",
      async (client, signal, input) => {
        response.setHeader(
          "Content-Type",
          "application/x-ndjson; charset=utf-8",
        );
        response.setHeader("X-Accel-Buffering", "no");
        response.flushHeaders();
        const emit = (event: ReviewEvent) => {
          if (!response.destroyed) response.write(JSON.stringify(event) + "\n");
        };
        const report = options.crossfire
          ? await options.crossfire.review(client, input, emit, signal)
          : await runReview(client, input, emit, signal, {
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
        if (!matchesLiveReview(report, input))
          throw new ProviderOutputError("malformed");
        emit({ type: "report", report });
        response.end();
      },
    ),
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
