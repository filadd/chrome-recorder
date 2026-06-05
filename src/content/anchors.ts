// Locale-independent hook into Meet's DOM: icon ligature text survives UI
// translations and most redesigns; localized labels and minified classes don't.

const HANGUP_LIGATURES = new Set(["call_end", "call_end_alt"]);

export const findHangupButton = (): Element | null => {
  for (const icon of document.querySelectorAll("i, span.notranslate")) {
    if (HANGUP_LIGATURES.has(icon.textContent?.trim() ?? "")) {
      return icon.closest("button, [role='button']") ?? icon;
    }
  }

  return null;
};
