import { extractMeetSlug } from "../shared/meet";
import {
  CONTENT_MESSAGE_TYPE,
  isForTarget,
  MESSAGE_TARGET,
  sendMessage,
  STOP_REASON,
  SW_MESSAGE_TYPE,
} from "../shared/messages";
import { getSnapshot, UI_STATE } from "../shared/storage";
import { watchCallEnd } from "./leave-detection";
import { getMicMuted, watchMicMute } from "./mute-detection";
import { mountOverlay } from "./overlay";

if (extractMeetSlug(location.href) != null) {
  mountOverlay();

  watchCallEnd(async () => {
    const { state } = await getSnapshot();

    if (state === UI_STATE.recording || state === UI_STATE.arming) {
      sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.stopRecording, reason: STOP_REASON.leave });
    }
  });

  watchMicMute((muted) => {
    sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.micMuteChanged, muted });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isForTarget(message, MESSAGE_TARGET.content) && message.type === CONTENT_MESSAGE_TYPE.queryMicMute) {
      sendResponse({ muted: getMicMuted() });
    }
  });
}
