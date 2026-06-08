import { GetObjectCommand, GetObjectTaggingCommand, PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { submitTranscription } from "./pipeline/deepgram";
import { profileForKey } from "./pipeline/routing";
import { getPipelineSecret } from "./pipeline/secrets";
import { s3 } from "./s3";

// Minimal shape of the S3 ObjectCreated notification (we don't depend on
// @types/aws-lambda for two fields).
interface S3Event {
  Records?: { s3: { bucket: { name: string }; object: { key: string } } }[];
}

// The source URL only has to stay valid until Deepgram fetches it; 1h leaves
// headroom for async queueing while keeping a leaked URL short-lived.
const presignGetExpiresSeconds = (): number =>
  Number(process.env.PRESIGN_GET_EXPIRES_SECONDS ?? 3600);

const currentStatus = async (bucket: string, key: string): Promise<string | null> => {
  const result = await s3.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: key }));

  return result.TagSet?.find((tag) => tag.Key === "status")?.Value ?? null;
};

const buildCallbackUrl = (key: string, token: string): string => {
  const base = process.env.CALLBACK_URL;

  if (base == null || base === "") {
    throw new Error("CALLBACK_URL is not configured");
  }

  // Deepgram can't set a custom callback body, so the correlation (which object)
  // and the auth token ride in the callback URL's query string.
  const url = new URL(base);
  url.searchParams.set("key", key);
  url.searchParams.set("token", token);

  return url.toString();
};

const ingestOne = async (bucket: string, key: string): Promise<void> => {
  // EventBridge/S3 can't filter on suffix, and a stray non-audio key shouldn't
  // reach Deepgram — gate on extension and a known profile prefix here.
  if (!key.endsWith(".webm") || profileForKey(key) == null) {
    return;
  }

  // S3 delivery is at-least-once; a duplicate event must not re-submit (and
  // re-bill) the same object.
  if ((await currentStatus(bucket, key)) != null) {
    console.info(`[ingest] ${key} already in flight — skipping`);
    return;
  }

  const secret = await getPipelineSecret();

  const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: presignGetExpiresSeconds(),
  });

  const requestId = await submitTranscription(
    secret.deepgramApiKey,
    sourceUrl,
    buildCallbackUrl(key, secret.callbackToken),
  );

  await s3.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: { TagSet: [{ Key: "status", Value: "submitted" }] },
    }),
  );

  console.info(`[ingest] ${key} submitted to Deepgram (request_id=${requestId})`);
};

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records ?? []) {
    const bucket = record.s3.bucket.name;
    // S3 event keys are URL-encoded (spaces as "+").
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    await ingestOne(bucket, key);
  }
};
