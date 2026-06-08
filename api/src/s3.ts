import { S3Client } from "@aws-sdk/client-s3";

import type { BucketRef } from "./profiles";

// WHEN_REQUIRED stops the SDK from injecting CRC checksum headers into presigned
// UploadPart URLs — the browser can't send them, and the signature would break.
// The staging bucket's region — pinned independently of the runtime's AWS_REGION
// so the Lambda can run in any region (e.g. sa-east-1) while still signing for the
// us-east-1 bucket. A wrong region here breaks presigned PUTs (SigV4 host mismatch).
export const s3 = new S3Client({
  region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1",
  requestChecksumCalculation: "WHEN_REQUIRED",
  ...(process.env.S3_ENDPOINT != null
    ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
    : {}),
});

const BUCKET_ENV: Record<BucketRef, string> = {
  orientation: "S3_BUCKET_ORIENTATION",
  project: "S3_BUCKET_PROJECT",
};

// The client only ever names a logical bucket ref; the operator maps each ref to a
// real bucket here, enabling per-use-case bucket policies.
export const resolveBucket = (ref: BucketRef): string => {
  const bucket = process.env[BUCKET_ENV[ref]];

  if (bucket == null || bucket === "") {
    throw new Error(`Bucket env var ${BUCKET_ENV[ref]} is not configured`);
  }

  return bucket;
};

export const presignExpiresSeconds = (): number =>
  Number(process.env.PRESIGN_EXPIRES_SECONDS ?? 3600);
