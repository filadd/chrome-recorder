import { useEffect, useState } from "react";

import { extractMeetSlug } from "../../shared/meet";

// One-shot query — the popup is too short-lived for tab subscriptions.
export const useActiveMeetTab = (): { slug: string | null; loaded: boolean } => {
  const [slug, setSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      setSlug(extractMeetSlug(tab?.url));
      setLoaded(true);
    });
  }, []);

  return { slug, loaded };
};
