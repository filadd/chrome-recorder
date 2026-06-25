import { t } from "../shared/i18n";
import { MESSAGE_TARGET, sendMessage, SW_MESSAGE_TYPE } from "../shared/messages";
import { getSnapshot, onSnapshotChange, UI_STATE, type UiSnapshot } from "../shared/storage";

const OVERLAY_STYLE = `
  :host {
    all: initial;
  }

  .pill {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 420px;
    padding: 8px 14px;
    border-radius: 999px;
    background: #fff;
    color: #1a1a1a;
    border: 1.5px solid #c8c4bc;
    font-family: "Google Sans", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.3;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    user-select: none;
  }

  .pill:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
  }

  .pill.attention {
    background: #1a1a1a;
    color: #fff;
    border-color: #1a1a1a;
    white-space: normal;
  }

  .pill.error {
    background: #fff5f5;
    border-color: #c43434;
    color: #c43434;
    white-space: normal;
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #c43434;
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

const formatElapsed = (startedAt: number): string => {
  const total = Math.floor((Date.now() - startedAt) / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

// Purely informative — recording is controlled from the extension popup; the pill
// floats top-center and always reflects the snapshot state.
export const mountOverlay = (): void => {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = OVERLAY_STYLE;

  const pill = document.createElement("div");
  pill.className = "pill";
  pill.title = t("overlay_open_menu");

  // A content-script click can't grant tabCapture, so the pill only opens the
  // popup (the actual start/stop control); the SW owns chrome.action.openPopup().
  pill.addEventListener("click", () => {
    sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.openPopup });
  });

  const dot = document.createElement("span");
  dot.className = "dot";

  const label = document.createElement("span");

  pill.append(dot, label);
  root.append(style, pill);
  document.documentElement.append(host);

  let snapshot: UiSnapshot | null = null;
  let timer: number | null = null;

  const render = () => {
    if (snapshot == null) {
      return;
    }

    const { state, startedAt, micMuted, error } = snapshot;

    pill.classList.toggle("recording", state === UI_STATE.recording);
    pill.classList.toggle("attention", state === UI_STATE.idle || state === UI_STATE.needsPermission);
    pill.classList.toggle("error", state === UI_STATE.error);
    dot.classList.toggle("hidden", state !== UI_STATE.recording && state !== UI_STATE.arming);

    if (state === UI_STATE.recording && startedAt != null) {
      label.textContent = `${t("overlay_recording")} ${formatElapsed(startedAt)}${micMuted ? ` · ${t("overlay_mic_muted")}` : ""}`;
    } else if (state === UI_STATE.arming) {
      label.textContent = t("popup_status_arming");
    } else if (state === UI_STATE.stopping || state === UI_STATE.finalizing) {
      label.textContent = t("overlay_uploading");
    } else if (state === UI_STATE.finished) {
      label.textContent = t("overlay_finished");
    } else if (state === UI_STATE.needsPermission) {
      label.textContent = t("overlay_needs_permission");
    } else if (state === UI_STATE.error) {
      label.textContent = `${t("overlay_error")}${error != null ? ` — ${error.slice(0, 120)}` : ""}`;
    } else {
      label.textContent = t("overlay_coachmark");
    }

    if (state === UI_STATE.recording && timer == null) {
      timer = window.setInterval(render, 1000);
    } else if (state !== UI_STATE.recording && timer != null) {
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
