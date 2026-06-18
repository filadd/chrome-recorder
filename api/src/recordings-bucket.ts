// The Processing flow's read side: it reads finished recordings from the transient
// recordings bucket (where file-uploads lands them), transcribes them, and deletes
// them. This mirrors what n8n's native S3 node will do — list, read metadata,
// presign a GET so transcript-api can fetch the bytes, and delete once transcribed.
//
// The recording is self-describing: `pitch_id` + `recorded_by` ride along as S3
// object metadata, stamped at create time (see app.ts), so processing never has to
// reconstruct which conversation a recording belongs to.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface RecordingObject {
  key: string;
  size: number;
  lastModified: string | null;
}

export interface RecordingMetadata {
  pitchId: string | null;
  recordedBy: string | null;
}

const PRESIGN_TTL_SECONDS = 3600;

const bucket = (): string => {
  const value = process.env.DESTINATION_BUCKET;

  if (value == null || value === "") {
    throw new Error("DESTINATION_BUCKET is not configured");
  }

  return value;
};

const prefix = (): string => {
  const value = process.env.DESTINATION_PATH ?? "";

  return value === "" || value.endsWith("/") ? value : `${value}/`;
};

let client: S3Client | null = null;

const s3 = (): S3Client => {
  // Region only; credentials come from the standard AWS provider chain (env vars in
  // local dev), so the stand-in never hard-codes secrets — same posture as the SW
  // never holding AWS creds.
  client ??= new S3Client({ region: process.env.AWS_REGION ?? "sa-east-1" });

  return client;
};

export const listRecordings = async (): Promise<RecordingObject[]> => {
  const result = await s3().send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix() }),
  );

  return (result.Contents ?? [])
    .filter((object) => object.Key != null && object.Key.endsWith(".webm"))
    .map((object) => ({
      key: object.Key!,
      size: object.Size ?? 0,
      lastModified: object.LastModified?.toISOString() ?? null,
    }));
};

export const readMetadata = async (key: string): Promise<RecordingMetadata> => {
  const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));

  // S3 lowercases x-amz-meta-* keys and strips the prefix; the SDK exposes them on
  // `Metadata`. The stand-in stamps `pitch_id`/`recorded_by` at create.
  const metadata = head.Metadata ?? {};

  return { pitchId: metadata.pitch_id ?? null, recordedBy: metadata.recorded_by ?? null };
};

export const presignRecording = async (key: string): Promise<string> =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: PRESIGN_TTL_SECONDS,
  });

export const deleteRecording = async (key: string): Promise<void> => {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
};
