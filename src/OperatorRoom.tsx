/// <reference types="vite/client" />

import { useEffect, useRef, useState } from "react";
import { reviewerIds, reviewers } from "../shared/reviewers.ts";
import type { PreviewFailure } from "../control-room/viewer.js";
import type { ControlRoomActivity } from "./controlRoomFeed.ts";
import "./operator-room.css";

const stationLabels = {
  inactive: "Not selected",
  queued: "Queued",
  working: "In progress",
  done: "Complete",
  unavailable: "Unavailable",
  skipped: "Skipped",
  unrecorded: "Not recorded",
  unreported: "No update",
};

const steelmanLabels = {
  waiting: "Waiting",
  verifying: "Verifying",
  synthesizing: "Preparing the memo",
  result: "Memo ready",
  unavailable: "Unavailable",
  stopped: "Stopped",
};

const previewMessages = {
  checking: "Checking for a local 3D model…",
  missing: "Local 3D model is missing.",
  checkFailed: "Could not check for the local 3D model.",
  loading: "Loading local scene…",
  unsupported: "WebGL 2 is unavailable in this browser.",
  loadFailed: "Could not load the local 3D scene.",
  contextLost: "The 3D preview lost its graphics connection.",
};

type Availability = "available" | "missing" | "checkFailed";
type Preview = "closed" | "loading" | "ready" | PreviewFailure;
let assetCheck: Promise<Availability> | undefined;

function checkLocalModel() {
  assetCheck ??= fetch("/control-room-assets/control-room.glb", {
    method: "HEAD",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  })
    .then((response): Availability => {
      if (response.status === 404) return "missing";
      return response.ok &&
        response.headers.get("content-type")?.split(";")[0]?.trim() ===
          "model/gltf-binary"
        ? "available"
        : "checkFailed";
    })
    .catch((): Availability => "checkFailed");
  return assetCheck;
}

function LocalPreview({ activity }: { activity: ControlRoomActivity }) {
  const [desktop, setDesktop] = useState(
    () => matchMedia("(min-width: 769px)").matches,
  );
  const [availability, setAvailability] = useState<Availability | "checking">(
    "checking",
  );
  const [preview, setPreview] = useState<Preview>("closed");
  const root = useRef<HTMLDivElement>(null);
  const current = useRef(activity);
  const showing = preview === "loading" || preview === "ready";

  useEffect(() => {
    current.current = activity;
  }, [activity]);

  useEffect(() => {
    const media = matchMedia("(min-width: 769px)");
    const update = () => {
      setDesktop(media.matches);
      if (!media.matches) setPreview("closed");
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void checkLocalModel().then((result) => {
      if (active) setAvailability(result);
    });
    return () => {
      active = false;
    };
  }, [desktop]);

  useEffect(() => {
    if (!desktop || !showing || !root.current) return;
    const target = root.current;
    let active = true;
    let unmount: (() => void) | undefined;
    void import("../control-room/viewer.js")
      .then(({ mountControlRoom }) => {
        if (!active) return;
        unmount = mountControlRoom(
          target,
          () => current.current,
          () => {
            if (active) setPreview("ready");
          },
          (failure) => {
            if (!active) return;
            if (failure === "missing") assetCheck = undefined;
            setPreview(failure);
          },
        );
      })
      .catch(() => {
        if (active) setPreview("loadFailed");
      });
    return () => {
      active = false;
      unmount?.();
    };
  }, [desktop, showing]);

  if (!desktop) return null;
  const message =
    availability !== "available"
      ? previewMessages[availability]
      : preview === "ready"
        ? activity.source === "recorded"
          ? "Recorded animation"
          : "Live station activity"
        : preview === "closed"
          ? ""
          : previewMessages[preview];
  return (
    <div className="operator-preview">
      {availability === "available" && preview !== "missing" && (
        <button
          type="button"
          className="button"
          onClick={() => setPreview(showing ? "closed" : "loading")}
        >
          {showing ? "Close 3D preview" : "Load local 3D preview"}
        </button>
      )}
      <p role="status" className="field-note">
        {message}
      </p>
      {showing && (
        <div className="operator-viewer" ref={root} aria-hidden="true">
          <canvas />
          <div className="room-flow" hidden>
            <div data-room-mode></div>
            <div data-room-phase></div>
            <ul data-room-stations></ul>
            <p data-room-relay hidden></p>
          </div>
        </div>
      )}
    </div>
  );
}

export function OperatorRoom({ activity }: { activity: ControlRoomActivity }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <details
      className="proposal operator-room"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>Operator Room</summary>
      <div className="operator-room-body">
        <p className="field-note">
          {activity.source === "recorded" ? "Recorded example" : "Live review"}
        </p>
        <ul className="operator-stations" aria-label="Operator Room stations">
          {reviewerIds.map((role) => {
            const { state } = activity.stations[role];
            const status =
              state === "queued" && activity.phase === "ready"
                ? activity.source === "recorded"
                  ? "unrecorded"
                  : "unreported"
                : state;
            return (
              <li key={role} data-state={status}>
                <strong>{reviewers[role].name}</strong>
                <span className="operator-station-status">
                  <i aria-hidden="true" />
                  {stationLabels[status]}
                </span>
              </li>
            );
          })}
          <li data-state={activity.steelman}>
            <strong>Steelman</strong>
            <span className="operator-station-status">
              <i aria-hidden="true" />
              {steelmanLabels[activity.steelman]}
            </span>
          </li>
        </ul>
        {import.meta.env.DEV && expanded && (
          <LocalPreview activity={activity} />
        )}
      </div>
    </details>
  );
}
