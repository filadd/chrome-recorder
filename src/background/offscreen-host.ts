const OFFSCREEN_URL = "src/offscreen/offscreen.html";

export const ensureOffscreenDocument = async (): Promise<void> => {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture tab and microphone audio while recording a meeting",
  });
};

export const closeOffscreenDocument = async (): Promise<void> => {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument().catch(() => undefined);
  }
};
