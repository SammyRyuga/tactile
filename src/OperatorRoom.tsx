/// <reference types="vite/client" />

import { useEffect, useRef, useState } from "react";
import { reviewerIds, reviewers } from "../shared/reviewers.ts";
import type { ControlRoomActivity } from "./controlRoomFeed.ts";
import "./operator-room.css";

const stationLabels = {
  inactive: "Not selected",
  queued: "Queued",
  working: "In progress",
  done: "Complete",
  unavailable: "Unavailable",
  skipped: "Skipped",
};

const steelmanLabels = {
  waiting: "Waiting",
  verifying: "Verifying",
  synthesizing: "Preparing the memo",
  result: "Memo ready",
  unavailable: "Unavailable",
  stopped: "Stopped",
};

export function OperatorRoom({ activity }: { activity: ControlRoomActivity }) {
  const [preview, setPreview] = useState<
    "closed" | "loading" | "ready" | "unavailable"
  >("closed");
  const root = useRef<HTMLDivElement>(null);
  const current = useRef(activity);
  useEffect(() => {
    current.current = activity;
  }, [activity]);
  const showing = preview === "loading" || preview === "ready";
  const localPreview = import.meta.env.DEV;

  useEffect(() => {
    if (!import.meta.env.DEV || !showing || !root.current) return;
    const target = root.current;
    const mobile = matchMedia("(max-width: 768px)");
    const closeOnMobile = () => {
      if (mobile.matches) setPreview("closed");
    };
    mobile.addEventListener("change", closeOnMobile);
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
          () => {
            if (active) setPreview("unavailable");
          },
        );
      })
      .catch(() => {
        if (active) setPreview("unavailable");
      });
    return () => {
      active = false;
      mobile.removeEventListener("change", closeOnMobile);
      unmount?.();
    };
  }, [showing]);

  return (
    <details
      className="proposal operator-room"
      onToggle={(event) => {
        if (!event.currentTarget.open) setPreview("closed");
      }}
    >
      <summary>Operator Room</summary>
      <p className="field-note">
        {activity.source === "recorded" ? "Recorded example" : "Live review"}
      </p>
      <ul className="operator-stations" aria-label="Operator Room stations">
        {reviewerIds.map((role) => {
          const { state } = activity.stations[role];
          return (
            <li key={role} data-state={state}>
              <strong>{reviewers[role].name}</strong>
              <span>
                {state === "queued" && activity.phase === "ready"
                  ? activity.source === "recorded"
                    ? "Not recorded"
                    : "No update"
                  : stationLabels[state]}
              </span>
            </li>
          );
        })}
        <li>
          <strong>Steelman</strong>
          <span>{steelmanLabels[activity.steelman]}</span>
        </li>
      </ul>
      {localPreview && (
        <div className="operator-preview">
          <button
            type="button"
            className="button"
            onClick={() => setPreview(showing ? "closed" : "loading")}
          >
            {showing ? "Close 3D preview" : "Load local 3D preview"}
          </button>
          <p role="status" className="field-note">
            {preview === "loading"
              ? "Loading local scene…"
              : preview === "unavailable"
                ? "3D preview unavailable. Review stations and the decision memo are still available."
                : showing
                  ? activity.source === "recorded"
                    ? "Recorded animation"
                    : "Live station activity"
                  : ""}
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
      )}
    </details>
  );
}
