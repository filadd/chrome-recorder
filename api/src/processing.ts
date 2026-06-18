// Processing flow (stand-in for n8n's schedule/poll flow): for each new recording in
// the bucket, read its metadata, transcribe it (diarized), write a pending Transcription
// with its Segments + Speakers into Notion, and delete the audio. The recording is
// transient — once its transcript exists, the audio is gone. A per-item failure is
// isolated (logged, audio kept for retry) so one bad recording never blocks the batch.

import {
  deleteRecording,
  listRecordings,
  presignRecording,
  readMetadata,
} from "./recordings-bucket";
import {
  addSegment,
  addSpeaker,
  createTranscription,
  resolvePersonByEmail,
  TRANSCRIPTION_STATE,
} from "./notion-client";
import { transcribeDiarized } from "./transcript-client";

export interface ProcessedRecording {
  key: string;
  pitchId: string | null;
  transcriptionId: string | null;
  segments: number;
  speakers: number;
  status: "transcribed" | "skipped" | "failed";
  error?: string;
}

const DEFAULT_LIMIT = 5;

const titleFor = (key: string, lastModified: string | null): string => {
  const uuid = key.split("/").pop()?.replace(/\.webm$/, "") ?? key;
  const when = (lastModified ?? new Date().toISOString()).slice(0, 10);

  return `Conversation ${uuid.slice(0, 8)} — ${when}`;
};

const processOne = async (
  key: string,
  lastModified: string | null,
): Promise<ProcessedRecording> => {
  const { pitchId, recordedBy } = await readMetadata(key);

  // No pitch means no conversation to attach the transcript to — leave the audio for a
  // human to investigate rather than transcribing it into a dangling row.
  if (pitchId == null) {
    return { key, pitchId, transcriptionId: null, segments: 0, speakers: 0, status: "skipped", error: "missing pitch_id metadata" };
  }

  const audioUrl = await presignRecording(key);
  const output = await transcribeDiarized(audioUrl);

  // `Recorded by` is best-effort: resolving an email to a Notion Person needs the
  // user-list API, which a Personal Access Token cannot call (403 restricted_resource)
  // — only an integration token with the user-read capability can. Never let that
  // block the transcription; leave the Person unset when it can't be resolved.
  const recordedByUserId =
    recordedBy != null ? await resolvePersonByEmail(recordedBy).catch(() => null) : null;

  const transcriptionId = await createTranscription({
    title: titleFor(key, lastModified),
    pitchId,
    recordedByUserId,
    state: TRANSCRIPTION_STATE.pending,
  });

  // Speakers first: each segment relates to its Speaker row, so the rows must exist
  // before the segments that point at them.
  const speakerIndexes = [...new Set(output.segments.map((segment) => segment.speaker))].sort(
    (a, b) => a - b,
  );
  const speakerIdByIndex = new Map<number, string>();

  for (const speakerIndex of speakerIndexes) {
    speakerIdByIndex.set(speakerIndex, await addSpeaker({ transcriptionId, speakerIndex }));
  }

  let order = 1;

  for (const segment of output.segments) {
    await addSegment({
      transcriptionId,
      order,
      speakerId: speakerIdByIndex.get(segment.speaker)!,
      text: segment.text,
      startMs: segment.start_ms,
    });
    order += 1;
  }

  await deleteRecording(key);

  return {
    key,
    pitchId,
    transcriptionId,
    segments: output.segments.length,
    speakers: speakerIndexes.length,
    status: "transcribed",
  };
};

export const previewRecordings = async () => {
  const recordings = await listRecordings();

  return Promise.all(
    recordings.map(async (recording) => ({ ...recording, ...(await readMetadata(recording.key)) })),
  );
};

export const runProcessing = async (limit = DEFAULT_LIMIT): Promise<ProcessedRecording[]> => {
  const recordings = (await listRecordings()).slice(0, limit);
  const processed: ProcessedRecording[] = [];

  for (const recording of recordings) {
    try {
      processed.push(await processOne(recording.key, recording.lastModified));
    } catch (error) {
      processed.push({
        key: recording.key,
        pitchId: null,
        transcriptionId: null,
        segments: 0,
        speakers: 0,
        status: "failed",
        error: String(error),
      });
    }
  }

  return processed;
};
