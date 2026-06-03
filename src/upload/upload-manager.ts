import {
  UPLOAD_BACKOFF_BASE_MS,
  UPLOAD_BACKOFF_CAP_MS,
  UPLOAD_MAX_ATTEMPTS,
} from "../shared/constants";
import type { UploadSession } from "../shared/messages";
import { completeUpload, getPartUrl, type UploadPartRef } from "./api-client";
import type { CutPart } from "./part-buffer";

interface UploadManagerCallbacks {
  onPartUploaded: (partNumber: number, etag: string) => void;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const backoff = (attempt: number) =>
  Math.min(UPLOAD_BACKOFF_BASE_MS * 2 ** attempt, UPLOAD_BACKOFF_CAP_MS) * (0.5 + Math.random());

export const createUploadManager = (
  session: UploadSession,
  { onPartUploaded }: UploadManagerCallbacks,
) => {
  const parts: Record<number, string> = {};

  // Sequential chain: part N+1 waits for part N. Upload order doesn't matter to S3,
  // but a single in-flight PUT avoids bandwidth contention with the live call.
  let queue: Promise<void> = Promise.resolve();
  let failure: Error | null = null;

  const uploadPart = async ({ partNumber, blob }: CutPart): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        // Presigned URLs expire — always fetch a fresh one per attempt.
        const url = await getPartUrl(session, partNumber);
        const res = await fetch(url, { method: "PUT", body: blob });

        if (!res.ok) {
          throw new Error(`Part ${partNumber} PUT failed: ${res.status}`);
        }

        const etag = res.headers.get("ETag");

        if (etag == null) {
          throw new Error(
            "Missing ETag header — the bucket CORS config must list ETag in ExposeHeaders",
          );
        }

        parts[partNumber] = etag;
        onPartUploaded(partNumber, etag);

        return;
      } catch (error) {
        console.warn(`[upload] part ${partNumber} attempt ${attempt + 1} failed:`, error);

        if (attempt + 1 >= UPLOAD_MAX_ATTEMPTS) {
          throw error;
        }

        await delay(backoff(attempt));
      }
    }
  };

  const enqueue = (part: CutPart): void => {
    queue = queue.then(() => {
      if (failure == null) {
        return uploadPart(part).catch((error) => {
          failure = error instanceof Error ? error : new Error(String(error));
        });
      }
    });
  };

  return {
    enqueue,

    async finalize(finalPart: CutPart | null): Promise<{ key: string; location: string }> {
      if (finalPart != null) {
        enqueue(finalPart);
      }

      await queue;

      if (failure != null) {
        throw failure;
      }

      const refs: UploadPartRef[] = Object.entries(parts)
        .map(([partNumber, etag]) => ({ PartNumber: Number(partNumber), ETag: etag }))
        .sort((a, b) => a.PartNumber - b.PartNumber);

      return completeUpload(session, refs);
    },
  };
};
