// The finalize step: invoked (async) when a human submits speaker names, or by
// the sweeper backstop with `bestGuess`. It applies the naming to the stored
// transcript, runs the heavy summary/context LLM pass — now that the names are
// known — writes Notion, and deletes the artifact (the terminus).

import { chat, parseJsonReply } from "./pipeline/llm";
import { appendMeetingEntry, readLivingContext, writeLivingContext } from "./pipeline/notion";
import { applyNaming, bestGuessNaming, type SpeakerNaming } from "./pipeline/review";
import { deleteArtifact, getArtifact } from "./pipeline/review-store";
import { getPipelineSecret } from "./pipeline/secrets";
import { PROFILE_IDS } from "./profiles";
import { resolveBucket } from "./s3";

export interface FinalizeEvent {
  key: string;
  naming?: SpeakerNaming;
  bestGuess?: boolean;
}

interface FinalizeLlmResult {
  summary: string;
  context: string;
}

const SYSTEM_PROMPT = [
  "You process transcripts of pitch/project meetings. Speakers are already labeled",
  "with their names (a still-generic `[speaker N]` means the name is unknown — keep it).",
  "Write a concise bullet summary, then merge the conversation into the running context:",
  "topics, decisions, and open action items — closing items that were resolved.",
  "Reply in the language of the transcript.",
  'Respond with ONLY a JSON object: {"summary": string, "context": string}.',
].join(" ");

const buildUserPrompt = (currentContext: string, transcript: string): string =>
  [
    "Current context (may be empty):",
    currentContext || "(none yet)",
    "",
    "Transcript:",
    transcript,
  ].join("\n");

const isNotFound = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

  return name === "NotFound" || name === "NoSuchKey" || status === 404;
};

// Prefer the meeting's own start time; fall back to today when it can't be parsed.
const entryDate = (startedAt: string): string => {
  const parsed = Date.parse(startedAt);

  return Number.isNaN(parsed) ? new Date().toISOString().slice(0, 10) : new Date(parsed).toISOString().slice(0, 10);
};

export const handler = async (event: FinalizeEvent): Promise<{ ok: boolean; note?: string }> => {
  const bucket = resolveBucket(PROFILE_IDS.project);

  let artifact;

  try {
    artifact = await getArtifact(bucket, event.key);
  } catch (error) {
    // Already finalized (artifact deleted) — ack so a duplicate invoke is a no-op.
    if (isNotFound(error)) {
      return { ok: true, note: "already finalized" };
    }

    throw error;
  }

  const naming: SpeakerNaming =
    event.bestGuess === true || event.naming == null
      ? bestGuessNaming(artifact)
      : event.naming;

  const labeled = applyNaming(artifact.transcript, naming);

  const secret = await getPipelineSecret();
  const currentContext = await readLivingContext(secret.notionApiKey, artifact.pitchId);

  const reply = await chat(secret.llmApiKey, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(currentContext, labeled.text) },
  ]);
  const result = parseJsonReply<FinalizeLlmResult>(reply);

  await appendMeetingEntry(secret.notionApiKey, artifact.pitchId, {
    date: entryDate(artifact.startedAt),
    participants: labeled.participants,
    summary: result.summary,
    transcript: labeled.text,
  });

  await writeLivingContext(secret.notionApiKey, artifact.pitchId, result.context);

  await deleteArtifact(bucket, event.key);

  return { ok: true };
};
