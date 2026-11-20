import { z } from "zod";
import { claimSchema, reviewEventSchema } from "../shared/review.ts";
import type { ReviewEvent, ReviewInput } from "../shared/review.ts";

export async function liveAvailable(signal: AbortSignal): Promise<boolean> {
  const response = await fetch("/api/status", { signal });
  const result = z
    .object({ live: z.boolean() })
    .safeParse(await response.json());
  return response.ok && result.success && result.data.live;
}

async function post(
  path: string,
  body: object,
  signal: AbortSignal,
): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (response.ok) return response;
  const data: unknown = await response.json().catch(() => null);
  const parsed = z.object({ message: z.string() }).safeParse(data);
  throw new Error(
    parsed.success
      ? parsed.data.message
      : "The server could not complete that request.",
  );
}

export async function extractLive(proposal: string, signal: AbortSignal) {
  const response = await post("/api/claims", { proposal }, signal);
  return z
    .object({ claims: z.array(claimSchema).min(1).max(6) })
    .parse(await response.json()).claims;
}

export async function runLive(
  input: ReviewInput,
  emit: (event: ReviewEvent) => void,
  signal: AbortSignal,
) {
  const response = await post("/api/reviews", input, signal);
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
        if (event.type === "error") throw new Error(event.message);
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
