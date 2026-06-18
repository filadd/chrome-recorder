import {
  UPLOAD_BACKOFF_BASE_MS,
  UPLOAD_BACKOFF_CAP_MS,
  UPLOAD_MAX_ATTEMPTS,
  UPLOAD_POLL_INTERVAL_MS,
  UPLOAD_POLL_MAX_ATTEMPTS,
} from "../shared/constants";
import type { PartTarget, UploadSession } from "../shared/messages";
import { getUploadStatus, recordPart } from "./api-client";
import type { CutPart } from "./part-buffer";

interface UploadManagerCallbacks {
  onPartUploaded: (partNumber: number, etag: string) => void;
}

const TERMINAL_ERRORS = new Set(["VALIDATION_ERROR", "TRANSCODING_ERROR", "UPLOAD_ERROR", "ABORTED"]);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const backoff = (attempt: number) =>
  Math.min(UPLOAD_BACKOFF_BASE_MS * 2 ** attempt, UPLOAD_BACKOFF_CAP_MS) * (0.5 + Math.random());

// Drives the file-uploads multipart loop: PUT each part to the presigned URL it
// holds, read the ETag, report it to the server, and receive the next part's URL.
// The server owns the parts ledger — the client only ever holds the next URL.
export const createUploadManager = (
  session: UploadSession,
  token: string,
  firstPart: PartTarget,
  { onPartUploaded }: UploadManagerCallbacks,
) => {
  let next: PartTarget = firstPart;
  let lastUploaded: { partNumber: number; etag: string } | null = null;

  // Sequential chain: part N+1 waits for part N — both because a single in-flight
  // PUT avoids contending with the live call, and because each part's URL only
  // arrives in the previous part's record response.
  let queue: Promise<void> = Promise.resolve();
  let failure: Error | null = null;

  // PUTs the part to the URL we currently hold (reusable across retries until it
  // expires), reports the ETag, then records it — `complete` rides the final part.
  const uploadPart = async ({ partNumber, blob }: CutPart, complete: boolean): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await fetch(next.url, { method: "PUT", body: blob });

        if (!res.ok) {
          throw new Error(`Part ${partNumber} PUT failed: ${res.status}`);
        }

        const etag = res.headers.get("ETag");

        if (etag == null) {
          throw new Error(
            "Missing ETag header — the bucket CORS config must list ETag in ExposeHeaders",
          );
        }

        onPartUploaded(partNumber, etag);
        lastUploaded = { partNumber, etag };

        const result = await recordPart({ key: session.key, partNumber, etag, complete }, token);

        if (!complete && result.url != null && result.partNumber != null) {
          next = { partNumber: result.partNumber, url: result.url };
        }

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
        return uploadPart(part, false).catch((error) => {
          failure = error instanceof Error ? error : new Error(String(error));
        });
      }
    });
  };

  const pollUntilTerminal = async (): Promise<string> => {
    for (let attempt = 0; attempt < UPLOAD_POLL_MAX_ATTEMPTS; attempt += 1) {
      const { status } = await getUploadStatus(session.key, token);

      if (status === "COMPLETED") {
        return status;
      }

      if (TERMINAL_ERRORS.has(status)) {
        throw new Error(`Upload ended in ${status}`);
      }

      await delay(UPLOAD_POLL_INTERVAL_MS);
    }

    // Still ASSEMBLING past the cap: the upload itself succeeded, the server just
    // hasn't finished assembling/post-processing — don't fail the recording.
    return "ASSEMBLING";
  };

  return {
    enqueue,

    async finalize(finalPart: CutPart | null): Promise<{ key: string; status: string }> {
      await queue;

      if (failure != null) {
        throw failure;
      }

      if (finalPart != null) {
        await uploadPart(finalPart, true);
      } else if (lastUploaded != null) {
        // No buffered tail (recording ended on a part boundary): re-send the last
        // recorded part with complete:true (idempotent on a matching ETag).
        await recordPart({ key: session.key, ...lastUploaded, complete: true }, token);
      } else {
        throw new Error("Nothing was uploaded");
      }

      return { key: session.key, status: await pollUntilTerminal() };
    },
  };
};
