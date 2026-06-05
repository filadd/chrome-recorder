// Meet's mic toggle carries a semantic, locale-independent data-is-muted
// attribute; the button is told apart from the camera toggle (which has the
// same attribute) by its mic/mic_off icon ligature.
const MIC_LIGATURES = new Set(["mic", "mic_off", "mic_none"]);

const findMicButton = (): Element | null => {
  for (const candidate of document.querySelectorAll("[data-is-muted]")) {
    for (const icon of candidate.querySelectorAll("i, span.notranslate")) {
      if (MIC_LIGATURES.has(icon.textContent?.trim() ?? "")) {
        return candidate;
      }
    }
  }

  return null;
};

export const getMicMuted = (): boolean | null => {
  const button = findMicButton();

  return button == null ? null : button.getAttribute("data-is-muted") === "true";
};

export const watchMicMute = (onChange: (muted: boolean) => void): void => {
  let lastMuted: boolean | null = null;

  const evaluate = () => {
    const muted = getMicMuted();

    if (muted != null && muted !== lastMuted) {
      lastMuted = muted;
      onChange(muted);
    }
  };

  // Subtree childList catches toolbar re-renders that replace the button; the
  // attribute filter catches the actual mute toggles.
  new MutationObserver(evaluate).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-is-muted"],
  });

  evaluate();
};
