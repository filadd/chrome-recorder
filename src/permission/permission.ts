import { applyI18n, t } from "../shared/i18n";
import { sendMessage } from "../shared/messages";

applyI18n(document);

const grantButton = document.getElementById("grant") as HTMLButtonElement;
const result = document.getElementById("result")!;

// Offscreen documents can't show permission prompts; this visible page obtains the
// one-time grant for the extension origin, after which the offscreen capture's
// getUserMedia succeeds silently.
grantButton.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());

    await sendMessage({ target: "sw", type: "mic-granted" });

    result.textContent = t("permission_granted");
    grantButton.classList.add("hidden");
  } catch {
    result.textContent = t("permission_denied");
  }

  result.classList.remove("hidden");
});
