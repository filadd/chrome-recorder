// Background polling for "my pending reviews". The SW owns the API calls and the
// toolbar badge; the UI only ever reads the cached queue from storage. Two alarms:
// a fast one that runs right after a recording (the review lands within minutes)
// and self-stops once it appears or the window elapses, and a slow daily one that
// keeps the badge roughly fresh. The popup also pokes a poll on open.

import { fetchPendingReviews } from "../review/review-client";
import { getReviewQueue, getSettings, setReviewQueue } from "../shared/storage";

const FAST_ALARM = "review-poll-fast";
const SLOW_ALARM = "review-poll-slow";

const FAST_PERIOD_MIN = 1;
const SLOW_PERIOD_MIN = 1440; // daily
const FAST_WINDOW_MS = 30 * 60_000;

const updateBadge = async (count: number): Promise<void> => {
  await chrome.action.setBadgeBackgroundColor({ color: "#c43434" });
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
};

// Fetches the queue and mirrors it into storage + the badge. Returns the count,
// or -1 when the fetch failed (the cached queue is left untouched on failure).
export const pollReviews = async (): Promise<number> => {
  const { userId } = await getSettings();

  if (userId.trim() === "") {
    await setReviewQueue({ items: [], polledAt: Date.now() });
    await updateBadge(0);
    return 0;
  }

  try {
    const items = await fetchPendingReviews(userId);

    await setReviewQueue({ items, polledAt: Date.now() });
    await updateBadge(items.length);

    return items.length;
  } catch (error) {
    console.warn("[reviews] poll failed:", error);
    return -1;
  }
};

export const ensureSlowPolling = (): void => {
  chrome.alarms.create(SLOW_ALARM, { periodInMinutes: SLOW_PERIOD_MIN });
};

// Called when a recording finishes: a review is incoming, so poll aggressively
// for a short window before falling back to the slow cadence.
export const startFastPolling = async (): Promise<void> => {
  await chrome.storage.session.set({ reviewFastUntil: Date.now() + FAST_WINDOW_MS });
  chrome.alarms.create(FAST_ALARM, { periodInMinutes: FAST_PERIOD_MIN });
};

// Optimistic local removal after a submit — finalize is async, so re-fetching
// would still see the not-yet-deleted artifact. Drop it from the cache directly.
export const dropReview = async (key: string): Promise<void> => {
  const queue = await getReviewQueue();
  const items = queue.items.filter((item) => item.key !== key);

  await setReviewQueue({ ...queue, items });
  await updateBadge(items.length);
};

export const onReviewAlarm = async (alarm: chrome.alarms.Alarm): Promise<void> => {
  if (alarm.name === SLOW_ALARM) {
    await pollReviews();
    return;
  }

  if (alarm.name === FAST_ALARM) {
    const count = await pollReviews();
    const { reviewFastUntil = 0 } = await chrome.storage.session.get<{ reviewFastUntil?: number }>(
      "reviewFastUntil",
    );

    if (count > 0 || Date.now() > reviewFastUntil) {
      await chrome.alarms.clear(FAST_ALARM);
    }
  }
};
