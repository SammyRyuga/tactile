import type { ControlRoomActivity } from "../src/controlRoomFeed.ts";

export type PreviewFailure =
  | "missing"
  | "unsupported"
  | "loadFailed"
  | "contextLost";

export function mountControlRoom(
  root: HTMLElement,
  readReview: () => ControlRoomActivity,
  onReady: (resetCamera: () => void) => void,
  onFailure: (reason: PreviewFailure) => void,
): () => void;
