import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, HeadObjectCommand, PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";

import { safeEquals } from "./auth";
import { guessSpeakerNames } from "./pipeline/review-guess";
import {
  buildSpeakers,
  linesToText,
  toTranscriptLines,
  type DeepgramResponse,
  type ReviewArtifact,
} from "./pipeline/review";
import { putArtifact } from "./pipeline/review-store";
import { profileForKey } from "./pipeline/routing";
import { getPipelineSecret } from "./pipeline/secrets";
import { resolveBucket, s3 } from "./s3";

const isNotFound = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

  return name === "NotFound" || name === "NoSuchKey" || status === 404;
};

// Builds the review artifact from the Deepgram transcript + the object's metadata
// contract. The expensive summary/context work is deferred to finalize, once a
// human (or the sweeper) has confirmed who each speaker is.
const buildArtifact = async (
  llmApiKey: string,
  metadata: Record<string, string>,
  response: DeepgramResponse,
): Promise<ReviewArtifact> => {
  const pitchId = metadata.pitch_id;

  if (pitchId == null || pitchId === "") {
    throw new Error("project recording missing pitch_id metadata");
  }

  const lines = toTranscriptLines(response);

  // Best-effort: a guess failure must not fail the callback (and trigger a
  // Deepgram retry) — the human names everyone in the review regardless.
  const guesses = await guessSpeakerNames(llmApiKey, linesToText(lines)).catch((error) => {
    console.warn("[callback] speaker-name guess failed:", error);
    return [];
  });

  return {
    id: randomUUID(),
    pitchId,
    recordedBy: metadata.recorded_by ?? "",
    meetSlug: metadata.meet_slug ?? "",
    startedAt: metadata.started_at ?? "",
    createdAt: new Date().toISOString(),
    speakers: buildSpeakers(lines, guesses),
    transcript: lines,
  };
};

const app = new Hono();

// Deepgram POSTs the transcript here once it finishes. Auth rides in the query
// string (Deepgram can't send Authorization: Bearer); the `dg-token` header is
// available as defense-in-depth but the shared secret is the gate.
app.post("/*", async (c) => {
  const key = c.req.query("key");
  const token = c.req.query("token");

  const secret = await getPipelineSecret();

  if (token == null || !safeEquals(token, secret.callbackToken)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (key == null || key === "") {
    return c.json({ error: "Missing key" }, 400);
  }

  const profileId = profileForKey(key);

  if (profileId == null) {
    return c.json({ error: "Unroutable key" }, 400);
  }

  const bucket = resolveBucket(profileId);

  let metadata: Record<string, string>;

  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    metadata = head.Metadata ?? {};
  } catch (error) {
    // A prior successful callback already deleted the object — ack so Deepgram
    // stops retrying instead of treating a duplicate as a failure.
    if (isNotFound(error)) {
      return c.json({ ok: true, note: "already processed" });
    }

    throw error;
  }

  // Weak lock — shrinks (not closes) the window for a duplicate Deepgram retry to
  // double-write. Delete-of-the-audio below is the real idempotency terminus.
  await s3.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: { TagSet: [{ Key: "status", Value: "processing" }] },
    }),
  );

  const artifact = await buildArtifact(
    secret.llmApiKey,
    metadata,
    (await c.req.json()) as DeepgramResponse,
  );

  // Persist the review, then drop the audio: the transcript now lives in the
  // artifact, so the 3-day transient-audio promise is kept without waiting for
  // the human review.
  await putArtifact(bucket, artifact);
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  return c.json({ ok: true });
});

app.onError((error, c) => {
  console.error("[callback] failed:", error);

  // 5xx makes Deepgram retry the callback (up to ~10x, 30s apart).
  return c.json({ error: String(error) }, 500);
});

export const handler = handle(app);
