import { extractMeetSlug } from "../shared/meet";
import { isForTarget, sendMessage } from "../shared/messages";
import { getSnapshot } from "../shared/storage";
import { watchCallEnd } from "./leave-detection";
import { getMicMuted, watchMicMute } from "./mute-detection";
import { mountOverlay } from "./overlay";

if (extractMeetSlug(location.href) != null) {
  mountOverlay();

  watchCallEnd(async () => {
    const { state } = await getSnapshot();

    if (state === "recording" || state === "arming") {
      sendMessage({ target: "sw", type: "stop-recording", reason: "leave" });
    }
  });

  watchMicMute((muted) => {
    sendMessage({ target: "sw", type: "mic-mute-changed", muted });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isForTarget(message, "content") && message.type === "query-mic-mute") {
      sendResponse({ muted: getMicMuted() });
    }
  });
}
