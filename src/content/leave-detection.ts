import { LEAVE_DEBOUNCE_MS } from "../shared/constants";
import { findHangupButton } from "./anchors";

// The hangup icon doubles as an "in call" heartbeat: its debounced disappearance
// catches every exit path (click, shortcut, host ended the call, kicked,
// connection lost), with a click fast-path for instant reaction.
export const watchCallEnd = (onCallEnd: () => void): void => {
  let inCall = false;
  let leaveTimer: number | null = null;
  let fastPathButton: Element | null = null;

  const confirmLeave = () => {
    if (inCall) {
      inCall = false;
      onCallEnd();
    }
  };

  const evaluate = () => {
    const button = findHangupButton();

    if (button != null) {
      inCall = true;

      if (leaveTimer != null) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }

      if (button !== fastPathButton) {
        fastPathButton = button;
        button.addEventListener("click", () => setTimeout(confirmLeave, 0));
      }
    } else if (inCall && leaveTimer == null) {
      leaveTimer = window.setTimeout(() => {
        leaveTimer = null;
        confirmLeave();
      }, LEAVE_DEBOUNCE_MS);
    }
  };

  new MutationObserver(evaluate).observe(document.body, { childList: true, subtree: true });
  evaluate();
};
