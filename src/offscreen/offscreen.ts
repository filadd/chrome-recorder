import { isForTarget, sendMessage } from "../shared/messages";
import { isRecording, startRecording, stopRecording } from "./recorder";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isForTarget(message, "offscreen")) {
    return;
  }

  switch (message.type) {
    case "start-capture":
      startRecording(message.streamId, message.session).catch((error) => {
        sendMessage({ target: "sw", type: "capture-error", message: String(error) });
      });
      break;

    case "stop-capture":
      stopRecording();
      break;

    case "ping":
      sendResponse({ recording: isRecording() });
      break;
  }
});
