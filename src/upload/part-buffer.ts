import { PART_SIZE_BYTES } from "../shared/constants";

export interface CutPart {
  partNumber: number;
  blob: Blob;
}

// Accumulates MediaRecorder chunks (an opaque, append-only byte stream) and cuts
// S3 parts at the 5 MiB floor. Only the final part may be smaller — S3 rejects the
// completion otherwise — so there is no time-based flush below the threshold.
export const createPartBuffer = (partSize: number = PART_SIZE_BYTES) => {
  let chunks: Blob[] = [];
  let bufferedBytes = 0;
  let nextPartNumber = 1;

  const cut = (): CutPart => {
    const part = { partNumber: nextPartNumber, blob: new Blob(chunks) };

    chunks = [];
    bufferedBytes = 0;
    nextPartNumber += 1;

    return part;
  };

  return {
    append(chunk: Blob): CutPart | null {
      chunks.push(chunk);
      bufferedBytes += chunk.size;

      return bufferedBytes >= partSize ? cut() : null;
    },

    flushFinal(): CutPart | null {
      return bufferedBytes > 0 ? cut() : null;
    },

    get bufferedBytes() {
      return bufferedBytes;
    },
  };
};
