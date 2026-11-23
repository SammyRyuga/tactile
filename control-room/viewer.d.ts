import type { ControlRoomActivity } from "../src/controlRoomFeed.ts";

export function mountControlRoom(
  root: HTMLElement,
  readReview: () => ControlRoomActivity,
  onReady: () => void,
  onFailure: () => void,
): () => void;
