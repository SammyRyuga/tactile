import { setTimeout as sleep } from "node:timers/promises";

const knownCodes = new Set([
  "rate_limit_exceeded",
  "rate_limit",
  "insufficient_quota",
  "quota_exceeded",
  "billing_hard_limit_reached",
  "billing_not_active",
  "payment_required",
  "credit_balance_too_low",
  "requests",
  "tokens",
  "RESOURCE_EXHAUSTED",
  "QUOTA_EXHAUSTED",
  "model_not_found",
  "invalid_api_key",
]);

export type LimitKind =
  | "billing"
  | "tokens"
  | "requests"
  | "daily"
  | "request_size"
  | "unknown";
type LimitWindow = { limit?: number; remaining?: number; resetMs?: number };
export type ProviderRate = { requests?: LimitWindow; tokens?: LimitWindow };
export type ProviderFailureDetails = {
  upstreamCode?: string;
  limitKind?: LimitKind;
  upstreamLimit?: number;
  upstreamUsed?: number;
  upstreamRequested?: number;
  retryHintMs?: number;
  rate?: ProviderRate;
};

export const maximumWaitMs = 10_000;

function counter(value: string | null) {
  return value !== null && /^\d{1,15}$/.test(value) ? Number(value) : undefined;
}

export function durationMs(
  value: string | null | undefined,
): number | undefined {
  if (
    !value ||
    value.length > 48 ||
    !/^(?:\d{1,8}(?:\.\d{1,9})?(?:ms|s|m|h|d))+$/.test(value)
  )
    return undefined;
  const multipliers = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Array.from(value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)).reduce(
    (sum, [, number, unit]) =>
      sum + Number(number) * multipliers[unit as keyof typeof multipliers],
    0,
  );
}

export function readRate(headers: Headers): ProviderRate | undefined {
  const read = (metric: "requests" | "tokens") => {
    const limit = counter(headers.get(`x-ratelimit-limit-${metric}`));
    const remaining = counter(headers.get(`x-ratelimit-remaining-${metric}`));
    const resetMs = durationMs(headers.get(`x-ratelimit-reset-${metric}`));
    return limit !== undefined ||
      remaining !== undefined ||
      resetMs !== undefined
      ? { limit, remaining, resetMs }
      : undefined;
  };
  const requests = read("requests");
  const tokens = read("tokens");
  return requests || tokens ? { requests, tokens } : undefined;
}

export function retryDelay(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  return /^\d+$/.test(value)
    ? Number(value) * 1000
    : Math.max(0, Date.parse(value) - Date.now());
}

// Error bodies are only inspected for recognized codes and numeric quota data.
// Do not attach the upstream message, headers or response body to an Error.
export async function readErrorBody(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const decoder = new TextDecoder();
  let text = "";
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16_384) return undefined;
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    signal.throwIfAborted();
    return undefined;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function failureDetails(
  status: number,
  body: unknown,
  rate?: ProviderRate,
): ProviderFailureDetails {
  const payload = record(body);
  const error = record(payload.error ?? payload);
  const codes = [error.code, error.type, error.status].filter(
    (code): code is string => typeof code === "string" && knownCodes.has(code),
  );
  const details: ProviderFailureDetails = { upstreamCode: codes[0], rate };
  if (
    status === 402 ||
    codes.some((code) =>
      /billing|payment|insufficient_quota|credit_balance/.test(code),
    )
  )
    details.limitKind = "billing";
  else if (status === 429) {
    const message = typeof error.message === "string" ? error.message : "";
    const unit = message.match(/\b(TPM|RPM|TPD|RPD)\b/)?.[1];
    const values = message.match(
      /\bLimit\s+(\d{1,12})(?:,?\s+Used\s+(\d{1,12}))?,?\s+Requested\s+(\d{1,12})/i,
    );
    const rpcDetails = Array.isArray(error.details)
      ? error.details.map(record)
      : [];
    const retryInfo = rpcDetails.find(
      (detail) =>
        detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
    );
    if (typeof retryInfo?.retryDelay === "string")
      details.retryHintMs = durationMs(retryInfo.retryDelay);
    const quotaFailure = rpcDetails.find(
      (detail) =>
        detail["@type"] === "type.googleapis.com/google.rpc.QuotaFailure",
    );
    const quotaIds = Array.isArray(quotaFailure?.violations)
      ? quotaFailure.violations
          .map((violation: unknown) => record(violation).quotaId)
          .filter((id: unknown): id is string => typeof id === "string")
      : [];
    if (values) {
      details.upstreamLimit = Number(values[1]);
      details.upstreamUsed = values[2] ? Number(values[2]) : undefined;
      details.upstreamRequested = Number(values[3]);
    }
    details.limitKind =
      unit === "RPD" ||
      unit === "TPD" ||
      quotaIds.some((id) => /PerDay/i.test(id))
        ? "daily"
        : details.upstreamRequested !== undefined &&
            details.upstreamLimit !== undefined &&
            details.upstreamRequested > details.upstreamLimit
          ? "request_size"
          : unit === "TPM" ||
              codes.includes("tokens") ||
              quotaIds.some((id) => /tokens.*PerMinute/i.test(id)) ||
              (rate?.tokens?.remaining === 0 && rate.requests?.remaining !== 0)
            ? "tokens"
            : unit === "RPM" ||
                codes.includes("requests") ||
                quotaIds.some((id) => /requests.*PerMinute/i.test(id)) ||
                (rate?.requests?.remaining === 0 &&
                  rate.tokens?.remaining !== 0)
              ? "requests"
              : "unknown";
  }
  return details;
}

export type RateSchedule = ReturnType<typeof createRateSchedule>;
export function createRateSchedule() {
  let waitUntil = 0;
  let limitKind: LimitKind | undefined;
  let queue = Promise.resolve();
  return {
    remainingWait: () => Math.max(0, waitUntil - Date.now()),
    limitKind: () => limitKind,
    defer(ms: number, reason?: LimitKind) {
      const deadline = Date.now() + ms;
      if (Number.isFinite(deadline) && deadline >= waitUntil) {
        waitUntil = deadline;
        limitKind = reason;
      }
    },
    async run<T>(serial: boolean, signal: AbortSignal, task: () => Promise<T>) {
      if (!serial) return task();
      const previous = queue;
      let release!: () => void;
      const next = new Promise<void>((resolve) => {
        release = resolve;
      });
      queue = previous.then(() => next);
      let abort!: () => void;
      try {
        signal.throwIfAborted();
        await Promise.race([
          previous,
          new Promise<never>((_, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener("abort", abort, { once: true });
          }),
        ]);
        signal.throwIfAborted();
        return await task();
      } finally {
        if (abort) signal.removeEventListener("abort", abort);
        release();
      }
    },
  };
}

export function waitForProvider(ms: number, signal: AbortSignal) {
  return sleep(ms, undefined, { signal }).catch(() => signal.throwIfAborted());
}
