import { DEFAULT_REVIEW_QUEUE, getReviewQueue, type ReviewQueue } from "../storage";
import { useStorageValue } from "./useStorageValue";

export const useReviewQueue = (): [ReviewQueue, boolean] =>
  useStorageValue(getReviewQueue, "reviewQueue", "local", DEFAULT_REVIEW_QUEUE);
