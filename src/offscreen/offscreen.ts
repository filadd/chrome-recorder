import { isForTarget, sendMessage } from "../shared/messages";
import { isRecording, setMicMuted, startRecording, stopRecording } from "./recorder";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isForTarget(message, "offscreen")) {
    return;
  }

  switch (message.type) {
    case "start-capture":
      // A duplicate start would acquire a second set of streams and orphan the
      // first one — leaving the mic indicator on with nothing recording.
      if (isRecording()) {
        console.warn("[offscreen] start-capture ignored: already recording");
        break;
      }

      startRecording(message.streamId, message.session).catch((error) => {
        sendMessage({ target: "sw", type: "capture-error", message: String(error) });
      });
      break;

    case "stop-capture":
      stopRecording();
      break;

    case "set-mic-muted":
      setMicMuted(message.muted);
      break;

    case "ping":
      sendResponse({ recording: isRecording() });
      break;
  }
});
