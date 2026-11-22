import { z } from "zod";
import {
  attachmentTextSchema,
  claimSchema,
  clarificationSchema,
  reviewEventSchema,
} from "../shared/review.ts";
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
): Promise<boolean> {
  const response = await fetch("/api/status", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Live status is unavailable.");
  const result = z
    .object({ live: z.boolean() })
    .safeParse(await response.json().catch(() => null));
  return response.ok && result.success && result.data.live;
}

async function post(
  path: string,
  body: object | Blob,
  signal: AbortSignal,
  token?: string,
): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    body: body instanceof Blob ? body : JSON.stringify(body),
    headers: {
      "Content-Type":
        body instanceof Blob ? "application/octet-stream" : "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
) {
  const response = await post("/api/claims", input, signal, token);
  return z
    .object({ claims: z.array(claimSchema).min(1).max(6) })
    .parse(await response.json()).claims;
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
) {
  const response = await post("/api/revisions", input, signal, token);
  return z.object({ proposal: z.string().min(20) }).parse(await response.json())
    .proposal;
}

export async function runLive(
  input: ReviewInput,
  emit: (event: ReviewEvent) => void,
  signal: AbortSignal,
  token?: string,
) {
  const response = await post("/api/reviews", input, signal, token);
  if (!response.body) throw new Error("The server returned an empty review.");
  let buffer = "";
  let receivedReport = false;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = reviewEventSchema.parse(JSON.parse(line));
        if (event.type === "error")
          throw new Error(event.message + requestReference(response));
        emit(event);
        if (event.type === "report") receivedReport = true;
      }
    }
    if (!receivedReport)
      throw new Error(
        "The review connection closed before a report arrived. Try again.",
      );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
