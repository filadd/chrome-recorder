// The review domain: the human-in-the-loop step between transcription and Notion.
//
// After Deepgram returns, the callback turns the diarized result into a *review
// artifact* (one `reviews/*.json` object) instead of writing Notion directly.
// The user names the speakers in the extension; finalize then applies that naming
// and writes Notion. Everything here is pure (no AWS/LLM) so it is unit-testable;
// S3 I/O lives in `review-store.ts`, the LLM guess pass in `review-guess.ts`.

import { sanitizeSegment } from "../keys";

// Minimal shape of the Deepgram pre-recorded response we depend on. With
// `utterances=true` Deepgram returns one entry per speaker turn; we fall back to
// the flat channel transcript when diarization/utterances are absent.
export interface DeepgramResponse {
  results?: {
    utterances?: { speaker?: number; transcript?: string; start?: number }[];
    channels?: { alternatives?: { transcript?: string }[] }[];
  };
}

export interface TranscriptLine {
  speaker: number;
  text: string;
  start: number;
}

export interface ReviewSpeaker {
  index: number;
  guess: string; // best-guess name from speech; "" when unknown
  confidence: number; // 0..1
  samples: string[]; // representative utterances, for "who is this?"
  wordCount: number;
}

export interface ReviewArtifact {
  id: string;
  pitchId: string;
  recordedBy: string;
  meetSlug: string;
  startedAt: string; // from the `started_at` object metadata
  createdAt: string; // ISO; when the artifact was written
  speakers: ReviewSpeaker[];
  transcript: TranscriptLine[];
}

// Inbox row — derivable from the object key alone, so `GET /reviews` is a single
// ListObjectsV2 with no per-object HeadObject/GetObject.
export interface ReviewSummary {
  key: string; // full S3 key; the id the extension passes back
  pitchId: string;
  createdAt: string; // ISO, parsed from the key's epoch-ms prefix
}

// What the extension submits to finalize a review.
export interface SpeakerNaming {
  names: Record<number, string>; // speaker index → name ("" / absent keeps it generic)
  merges: [number, number][]; // [from, into] — fold a duplicate speaker into another
  ignores: number[]; // speaker indices to drop entirely (noise/"hi, I'm late")
}

const MAX_SAMPLES = 3;
const SAMPLE_CHAR_LIMIT = 240;
const CONFIDENT_GUESS = 0.6;

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

// One entry per speaker turn (utterances=true); falls back to the flat channel
// transcript as a single speaker-0 line when diarization is absent.
export const toTranscriptLines = (response: DeepgramResponse): TranscriptLine[] => {
  const utterances = response.results?.utterances ?? [];

  if (utterances.length > 0) {
    return utterances
      .map((u) => ({ speaker: u.speaker ?? 0, text: (u.transcript ?? "").trim(), start: u.start ?? 0 }))
      .filter((line) => line.text !== "");
  }

  const flat = (response.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();

  return flat === "" ? [] : [{ speaker: 0, text: flat, start: 0 }];
};

// `[speaker N] text` lines — the shape the LLM guess prompt reads.
export const linesToText = (lines: TranscriptLine[]): string =>
  lines.map((line) => `[speaker ${line.speaker}] ${line.text}`).join("\n");

// Per speaker: their longest few utterances (most words = most recognizable),
// kept in chronological order and clipped so the artifact stays small.
const selectSamples = (lines: TranscriptLine[]): string[] =>
  [...lines]
    .sort((a, b) => wordCount(b.text) - wordCount(a.text))
    .slice(0, MAX_SAMPLES)
    .sort((a, b) => a.start - b.start)
    .map((line) => (line.text.length > SAMPLE_CHAR_LIMIT ? `${line.text.slice(0, SAMPLE_CHAR_LIMIT)}…` : line.text));

export interface SpeakerGuess {
  index: number;
  name: string;
  confidence: number;
}

// Builds the per-speaker summary from the transcript, folding in the LLM's name
// guesses (keyed by speaker index). Speakers are ordered by how much they spoke.
export const buildSpeakers = (
  lines: TranscriptLine[],
  guesses: SpeakerGuess[],
): ReviewSpeaker[] => {
  const byIndex = new Map<number, TranscriptLine[]>();

  for (const line of lines) {
    const bucket = byIndex.get(line.speaker) ?? [];
    bucket.push(line);
    byIndex.set(line.speaker, bucket);
  }

  const guessFor = new Map(guesses.map((g) => [g.index, g]));

  return [...byIndex.entries()]
    .map(([index, speakerLines]) => {
      const guess = guessFor.get(index);

      return {
        index,
        guess: guess?.name?.trim() ?? "",
        confidence: guess?.confidence ?? 0,
        samples: selectSamples(speakerLines),
        wordCount: speakerLines.reduce((sum, line) => sum + wordCount(line.text), 0),
      };
    })
    .sort((a, b) => b.wordCount - a.wordCount);
};

// reviews/{recordedBy}/{epochMs}-{pitchId}-{uuid}.json — the epoch prefix sorts
// chronologically and the pitchId (32 hex) is parseable back out for the inbox.
export const reviewKey = (artifact: Pick<ReviewArtifact, "recordedBy" | "pitchId" | "id" | "createdAt">): string =>
  `reviews/${sanitizeSegment(artifact.recordedBy)}/${Date.parse(artifact.createdAt)}-${artifact.pitchId}-${artifact.id}.json`;

const KEY_PATTERN = /^reviews\/[^/]+\/(\d+)-([0-9a-f]{32})-(.+)\.json$/;

export const parseReviewKey = (key: string): ReviewSummary | null => {
  const match = key.match(KEY_PATTERN);

  if (match == null) {
    return null;
  }

  return { key, pitchId: match[2], createdAt: new Date(Number(match[1])).toISOString() };
};

// The naming finalize applies when nobody reviewed in time: take each speaker's
// guess only when the model was confident, otherwise leave it generic.
export const bestGuessNaming = (artifact: ReviewArtifact): SpeakerNaming => ({
  names: Object.fromEntries(
    artifact.speakers
      .filter((s) => s.guess !== "" && s.confidence >= CONFIDENT_GUESS)
      .map((s) => [s.index, s.guess]),
  ),
  merges: [],
  ignores: [],
});

export interface LabeledTranscript {
  text: string; // `Name: ...` / `[speaker N] ...` lines
  participants: string; // distinct assigned names, comma-joined
}

// Applies the human (or best-guess) naming to the raw transcript: drops ignored
// speakers, redirects merged ones, and renders each line with its resolved label.
export const applyNaming = (
  transcript: TranscriptLine[],
  naming: SpeakerNaming,
): LabeledTranscript => {
  const ignored = new Set(naming.ignores);
  const mergeInto = new Map(naming.merges.map(([from, into]) => [from, into]));

  const resolve = (index: number): number => {
    const seen = new Set<number>();
    let current = index;

    while (mergeInto.has(current) && !seen.has(current)) {
      seen.add(current);
      current = mergeInto.get(current)!;
    }

    return current;
  };

  const labelOf = (index: number): string => naming.names[index]?.trim() || `[speaker ${index}]`;

  const used = new Set<string>();

  const text = transcript
    .filter((line) => !ignored.has(line.speaker) && !ignored.has(resolve(line.speaker)))
    .map((line) => {
      const target = resolve(line.speaker);
      const label = labelOf(target);

      if (naming.names[target]?.trim()) {
        used.add(naming.names[target].trim());
      }

      return label.startsWith("[speaker ") ? `${label} ${line.text}` : `${label}: ${line.text}`;
    })
    .join("\n");

  return { text, participants: [...used].join(", ") };
};
