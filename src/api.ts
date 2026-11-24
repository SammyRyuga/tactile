import { activeProviderSchema } from "../shared/providers.ts";
import type { ActiveProvider } from "../shared/providers.ts";
import { z } from "zod";
import {
  attachmentTextSchema,
  claimListSchema,
  clarificationSchema,
  matchesLiveReview,
  reviewEventSchema,
} from "../shared/review.ts";
import { reviewerByStage } from "../shared/reviewers.ts";
import type {
  AttachmentKind,
  ProposalIntake,
  ProposalRevision,
  ReviewEvent,
  ReviewInput,
} from "../shared/review.ts";

export function requestReference(response: Response) {
  const requestId = z.uuid().safeParse(response.headers.get("X-Request-Id"));
  return requestId.success ? ` Request ID ${requestId.data}.` : "";
}

export async function liveAvailable(
  signal: AbortSignal,
  token?: string,
): Promise<{ live: boolean; activeProvider?: ActiveProvider }> {
  const response = await fetch("/api/status", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Live status is unavailable.");
  const result = z
    .object({
      live: z.boolean(),
      activeProvider: activeProviderSchema.optional(),
    })
    .safeParse(await response.json().catch(() => null));
  if (!result.success) throw new Error("Live status is unavailable.");
  return result.data;
}

async function post(
  path: string,
  body: object | Blob,
  signal: AbortSignal,
  token?: string,
  selection?: ActiveProvider,
): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    body: body instanceof Blob ? body : JSON.stringify(body),
    headers: {
      "Content-Type":
        body instanceof Blob ? "application/octet-stream" : "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(selection
        ? { "X-Tactile-Provider": `${selection.id} ${selection.model}` }
        : {}),
    },
    signal,
  });
  if (response.ok) return response;
  const data: unknown = await response.json().catch(() => null);
  const parsed = z.object({ message: z.string() }).safeParse(data);
  const clarification = z
    .object({ clarification: clarificationSchema })
    .safeParse(data);
  if (response.status === 422 && clarification.success)
    throw new IntakeClarification(clarification.data.clarification);
  throw new Error(
    parsed.success
      ? parsed.data.message + requestReference(response)
      : "The server could not complete that request." +
          requestReference(response),
  );
}

export async function extractLive(
  input: ProposalIntake,
  signal: AbortSignal,
  token?: string,
  selection?: ActiveProvider,
) {
  const response = await post("/api/claims", input, signal, token, selection);
  const parsed = z
    .object({ claims: claimListSchema })
    .safeParse(await response.json().catch(() => null));
  if (!parsed.success)
    throw new Error("The server returned invalid assumptions. Try again.");
  return parsed.data.claims;
}

export class IntakeClarification extends Error {
  readonly details: z.infer<typeof clarificationSchema>;

  constructor(details: z.infer<typeof clarificationSchema>) {
    super(details.question);
    this.details = details;
  }
}

export async function importAttachment(
  input: { url: string } | { file: File; kind: AttachmentKind },
  signal: AbortSignal,
  token?: string,
) {
  const response =
    "file" in input
      ? await post(`/api/ingest/file/${input.kind}`, input.file, signal, token)
      : await post("/api/ingest/url", input, signal, token);
  return attachmentTextSchema.parse(await response.json());
}

export async function reviseProposal(
  input: ProposalRevision,
  signal: AbortSignal,
  token?: string,
  selection?: ActiveProvider,
) {
  const response = await post(
    "/api/revisions",
    input,
    signal,
    token,
    selection,
  );
  return z.object({ proposal: z.string().min(20) }).parse(await response.json())
    .proposal;
}

export async function runLive(
  input: ReviewInput,
  emit: (event: ReviewEvent) => void,
  signal: AbortSignal,
  token?: string,
  selection?: ActiveProvider,
) {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(135_000)]);
  const response = await post(
    "/api/reviews",
    input,
    requestSignal,
    token,
    selection,
  );
  if (!response.body) throw new Error("The server returned an empty review.");
  const maxLineLength = 2 * 1024 * 1024;
  const claims = new Set(input.claims.map(({ id }) => id));
  let buffer = "";
  let messages = 0;
  const reader = response.body
    .pipeThrough(new TextDecoderStream("utf-8", { fatal: true }))
    .getReader();
  const abortReader = () => void reader.cancel().catch(() => undefined);
  requestSignal.addEventListener("abort", abortReader, { once: true });
  try {
    while (true) {
      requestSignal.throwIfAborted();
      const { value, done } = await reader.read().catch(() => {
        requestSignal.throwIfAborted();
        throw new Error("The review response was interrupted. Try again.");
      });
      requestSignal.throwIfAborted();
      if (done) break;
      buffer += value;
      let start = 0;
      for (
        let end = buffer.indexOf("\n");
        end !== -1;
        end = buffer.indexOf("\n", start)
      ) {
        if (end - start > maxLineLength || ++messages > 4096)
          throw new Error("The review response exceeded its size limit.");
        const line = buffer.slice(start, end);
        start = end + 1;
        if (!line.trim()) continue;
        let event: ReviewEvent;
        try {
          event = reviewEventSchema.parse(JSON.parse(line));
        } catch {
          throw new Error("The review response was invalid. Try again.");
        }
        if (event.type === "error")
          throw new Error(event.message + requestReference(response));
        if (event.type === "report") {
          if (!matchesLiveReview(event.report, input))
            throw new Error(
              "The report did not match the submitted review. Try again.",
            );
          emit(event);
          return;
        }
        const reviewer = reviewerByStage[event.stage];
        if (
          (!event.claimId || claims.has(event.claimId)) &&
          (!reviewer || !input.reviewers || input.reviewers.includes(reviewer))
        )
          emit(event);
      }
      buffer = buffer.slice(start);
      if (buffer.length > maxLineLength)
        throw new Error("The review response exceeded its size limit.");
    }
    throw new Error(
      "The review connection closed before a report arrived. Try again.",
    );
  } finally {
    requestSignal.removeEventListener("abort", abortReader);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
