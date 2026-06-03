import { extractMeetSlug } from "../shared/meet";
import { sendMessage } from "../shared/messages";
import { getSnapshot } from "../shared/storage";
import { watchCallEnd } from "./leave-detection";
import { mountOverlay } from "./overlay";

if (extractMeetSlug(location.href) != null) {
  mountOverlay();

  watchCallEnd(async () => {
    const { state } = await getSnapshot();

    if (state === "recording" || state === "arming") {
      sendMessage({ target: "sw", type: "stop-recording", reason: "leave" });
    }
  });
}
