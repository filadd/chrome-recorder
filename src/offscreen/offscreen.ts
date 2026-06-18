import {
  isForTarget,
  MESSAGE_TARGET,
  OFFSCREEN_MESSAGE_TYPE,
  sendMessage,
  SW_MESSAGE_TYPE,
} from "../shared/messages";
import { isRecording, setMicMuted, startRecording, stopRecording } from "./recorder";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isForTarget(message, MESSAGE_TARGET.offscreen)) {
    return;
  }

  switch (message.type) {
    case OFFSCREEN_MESSAGE_TYPE.startCapture:
      // A duplicate start would acquire a second set of streams and orphan the
      // first one — leaving the mic indicator on with nothing recording.
      if (isRecording()) {
        console.warn("[offscreen] start-capture ignored: already recording");
        break;
      }

      startRecording(message.streamId, message.session, message.token, message.firstPart).catch(
        (error) => {
          sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.captureError, message: String(error) });
        },
      );
      break;

    case OFFSCREEN_MESSAGE_TYPE.stopCapture:
      stopRecording();
      break;

    case OFFSCREEN_MESSAGE_TYPE.setMicMuted:
      setMicMuted(message.muted);
      break;

    case OFFSCREEN_MESSAGE_TYPE.ping:
      sendResponse({ recording: isRecording() });
      break;
  }
});
