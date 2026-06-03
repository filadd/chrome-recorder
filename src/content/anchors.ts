// Locale-independent hooks into Meet's DOM. Icon ligature text and semantic
// data-* attributes survive UI translations and most redesigns; anything based
// on localized labels or minified class names does not.

const HANGUP_LIGATURES = new Set(["call_end", "call_end_alt"]);

export const findHangupButton = (): Element | null => {
  for (const icon of document.querySelectorAll("i, span.notranslate")) {
    if (HANGUP_LIGATURES.has(icon.textContent?.trim() ?? "")) {
      return icon.closest("button, [role='button']") ?? icon;
    }
  }

  return null;
};

// Pre-join screen: the semantic promo anchor is the most stable hook; the
// jsname is the ecosystem-wide fallback (used by StreamDeck-Meet and others).
export const findJoinButton = (): Element | null => {
  const promo = document.querySelector('[data-promo-anchor-id="join-button"]');

  if (promo != null) {
    return promo.closest("button") ?? promo;
  }

  const byJsname = document.querySelector('[jsname="Qx7uuf"]');

  if (byJsname != null) {
    return byJsname.closest("button") ?? byJsname.querySelector("button") ?? byJsname;
  }

  return null;
};

// The account avatar has no stable attribute hook, so it's located geometrically:
// a googleusercontent profile image sitting in the top-right region of the page.
export const findTopBarAvatar = (): Element | null => {
  for (const img of document.querySelectorAll<HTMLImageElement>(
    'img[src*="googleusercontent.com"]',
  )) {
    const rect = img.getBoundingClientRect();

    if (rect.width > 0 && rect.top < 100 && rect.right > window.innerWidth * 0.7) {
      return img.closest("button, a, [role='button']") ?? img;
    }
  }

  return null;
};
