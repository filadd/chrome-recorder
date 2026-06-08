// Backstop for never-reviewed recordings: a scheduled (daily) sweep that
// finalizes any review artifact older than REVIEW_STALE_DAYS with the LLM's
// best-guess labels, so a forgotten review still reaches Notion and the queue
// self-cleans. The bucket's `reviews/` lifecycle expiry is the ultimate backstop
// beneath this.

import { handler as finalize } from "./finalize";
import { listStaleReviews } from "./pipeline/review-store";
import { PROFILE_IDS } from "./profiles";
import { resolveBucket } from "./s3";

const DAY_MS = 86_400_000;

const staleDays = (): number => Number(process.env.REVIEW_STALE_DAYS ?? 7);

export const handler = async (): Promise<{ finalized: number }> => {
  const bucket = resolveBucket(PROFILE_IDS.project);
  const cutoff = new Date(Date.now() - staleDays() * DAY_MS);
  const keys = await listStaleReviews(bucket, cutoff);

  let finalized = 0;

  for (const key of keys) {
    try {
      await finalize({ key, bestGuess: true });
      finalized += 1;
    } catch (error) {
      console.error(`[sweeper] finalize ${key} failed:`, error);
    }
  }

  console.info(`[sweeper] finalized ${finalized}/${keys.length} stale reviews`);

  return { finalized };
};
