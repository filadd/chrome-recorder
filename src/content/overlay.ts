import { t } from "../shared/i18n";
import { getSnapshot, onSnapshotChange, type UiSnapshot } from "../shared/storage";
import { findHangupButton, findJoinButton, findTopBarAvatar } from "./anchors";

const REANCHOR_INTERVAL_MS = 2_000;

const OVERLAY_STYLE = `
  :host {
    all: initial;
  }

  :host(.mode-topbar) {
    display: inline-flex;
    align-items: center;
  }

  :host(.mode-join) {
    display: block;
    margin-bottom: 12px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 340px;
    margin: 0 8px;
    padding: 8px 14px;
    border-radius: 999px;
    background: #303134;
    color: #e8eaed;
    font-family: "Google Sans", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.3;
    white-space: nowrap;
  }

  .pill.floating {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }

  .pill.attention {
    background: #1a73e8;
    white-space: normal;
  }

  .pill.error {
    background: #5c1d18;
    white-space: normal;
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #dc2626;
  }

  .recording .dot {
    animation: pulse 1.2s infinite;
  }

  @keyframes pulse {
    50% { opacity: 0.3; }
  }

  .hidden {
    display: none;
  }
`;

type Placement =
  | { mode: "topbar" | "join"; anchor: Element; position: InsertPosition }
  | { mode: "floating" };

// In a call the pill goes in the top bar, right after the account avatar; on the
// pre-join screen it sits right above the join button; floating is the fallback
// for whatever Meet DOM we fail to recognize.
const resolvePlacement = (): Placement => {
  if (findHangupButton() != null) {
    const avatar = findTopBarAvatar();

    return avatar != null
      ? { mode: "topbar", anchor: avatar, position: "afterend" }
      : { mode: "floating" };
  }

  const join = findJoinButton();

  return join != null
    ? { mode: "join", anchor: join, position: "beforebegin" }
    : { mode: "floating" };
};

const formatElapsed = (startedAt: number): string => {
  const total = Math.floor((Date.now() - startedAt) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Purely informative — recording is controlled from the extension popup (or the
// keyboard shortcut); the pill only reflects the snapshot state.
export const mountOverlay = (): void => {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = OVERLAY_STYLE;

  const pill = document.createElement("div");
  pill.className = "pill hidden";

  const dot = document.createElement("span");
  dot.className = "dot";

  const label = document.createElement("span");

  pill.append(dot, label);
  root.append(style, pill);

  let currentAnchor: Element | null = null;

  const anchor = () => {
    const placement = resolvePlacement();

    host.classList.toggle("mode-topbar", placement.mode === "topbar");
    host.classList.toggle("mode-join", placement.mode === "join");
    pill.classList.toggle("floating", placement.mode === "floating");

    if (placement.mode === "floating") {
      if (!host.isConnected || currentAnchor != null) {
        currentAnchor = null;
        document.documentElement.append(host);
      }
    } else if (!host.isConnected || currentAnchor !== placement.anchor) {
      currentAnchor = placement.anchor;
      placement.anchor.insertAdjacentElement(placement.position, host);
    }
  };

  setInterval(anchor, REANCHOR_INTERVAL_MS);
  anchor();

  let snapshot: UiSnapshot | null = null;
  let timer: number | null = null;

  const render = () => {
    if (snapshot == null) {
      return;
    }

    const { state, startedAt, error } = snapshot;

    pill.classList.toggle("recording", state === "recording");
    pill.classList.toggle("attention", state === "idle" || state === "needsPermission");
    pill.classList.toggle("error", state === "error");
    dot.classList.toggle("hidden", state !== "recording" && state !== "arming");

    if (state === "recording" && startedAt != null) {
      label.textContent = `${t("overlay_recording")} ${formatElapsed(startedAt)}`;
    } else if (state === "arming") {
      label.textContent = t("popup_status_arming");
    } else if (state === "stopping" || state === "finalizing") {
      label.textContent = t("overlay_uploading");
    } else if (state === "finished") {
      label.textContent = t("overlay_finished");
    } else if (state === "needsPermission") {
      label.textContent = t("overlay_needs_permission");
    } else if (state === "error") {
      label.textContent = `${t("overlay_error")}${error != null ? ` — ${error.slice(0, 120)}` : ""}`;
    } else {
      label.textContent = t("overlay_coachmark");
    }

    pill.classList.remove("hidden");

    if (state === "recording" && timer == null) {
      timer = window.setInterval(render, 1000);
    } else if (state !== "recording" && timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };

  getSnapshot().then((value) => {
    snapshot = value;
    render();
  });

  onSnapshotChange((value) => {
    snapshot = value;
    render();
  });
};
