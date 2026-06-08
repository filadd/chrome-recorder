import { DeleteObjectCommand, HeadObjectCommand, PutObjectTaggingCommand } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";

import { safeEquals } from "./auth";
import { chat, parseJsonReply } from "./pipeline/llm";
import { appendMeetingEntry, readLivingContext, writeLivingContext } from "./pipeline/notion";
import { profileForKey } from "./pipeline/routing";
import { getPipelineSecret, type PipelineSecret } from "./pipeline/secrets";
import { formatTranscript, type DeepgramResponse } from "./pipeline/transcript";
import { resolveBucket, s3 } from "./s3";

const isNotFound = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

  return name === "NotFound" || name === "NoSuchKey" || status === 404;
};

interface ProjectLlmResult {
  labeledTranscript: string;
  summary: string;
  context: string;
}

const SYSTEM_PROMPT = [
  "You process transcripts of pitch/project meetings.",
  "Speakers are diarized as `[speaker N]`. Using the participant list and conversational cues",
  "(introductions, who is addressed), relabel each `[speaker N]` with the participant's name;",
  "leave a speaker as `[speaker N]` if you are not confident.",
  "Then write a concise bullet summary, and merge the conversation into the running context:",
  "topics, decisions, and open action items — closing items that were resolved.",
  "Reply in the language of the transcript.",
  'Respond with ONLY a JSON object: {"labeledTranscript": string, "summary": string, "context": string}.',
].join(" ");

const buildUserPrompt = (input: {
  participants: string;
  currentContext: string;
  transcript: string;
}): string =>
  [
    `Participants: ${input.participants || "(unknown)"}`,
    "",
    "Current context (may be empty):",
    input.currentContext || "(none yet)",
    "",
    "Transcript:",
    input.transcript,
  ].join("\n");

const routeProject = async (
  secret: PipelineSecret,
  metadata: Record<string, string>,
  transcript: string,
): Promise<void> => {
  const pitchId = metadata.pitch_id;

  if (pitchId == null || pitchId === "") {
    throw new Error("project recording missing pitch_id metadata");
  }

  const participants = metadata.participants ?? "";
  const currentContext = await readLivingContext(secret.notionApiKey, pitchId);

  const reply = await chat(secret.llmApiKey, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt({ participants, currentContext, transcript }) },
  ]);
  const result = parseJsonReply<ProjectLlmResult>(reply);

  await appendMeetingEntry(secret.notionApiKey, pitchId, {
    date: new Date().toISOString().slice(0, 10),
    participants,
    summary: result.summary,
    transcript: result.labeledTranscript,
  });

  await writeLivingContext(secret.notionApiKey, pitchId, result.context);
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
  // double-write. Delete-on-success below is the real idempotency terminus.
  await s3.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: key,
      Tagging: { TagSet: [{ Key: "status", Value: "processing" }] },
    }),
  );

  const transcript = formatTranscript((await c.req.json()) as DeepgramResponse);

  await routeProject(secret, metadata, transcript);

  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

  return c.json({ ok: true });
});

app.onError((error, c) => {
  console.error("[callback] failed:", error);

  // 5xx makes Deepgram retry the callback (up to ~10x, 30s apart).
  return c.json({ error: String(error) }, 500);
});

export const handler = handle(app);
