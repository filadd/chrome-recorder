// Mirrors the API's review contract (api/src/pipeline/review.ts). The server owns
// the authoritative copy; this is what the extension reads/writes over the wire.

export interface ReviewSummary {
  key: string; // full S3 key; the id passed back to fetch/finalize
  pitchId: string;
  createdAt: string; // ISO
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
  startedAt: string;
  createdAt: string;
  speakers: ReviewSpeaker[];
  transcript: TranscriptLine[];
}

// What the user submits to finalize a review.
export interface SpeakerNaming {
  names: Record<number, string>; // speaker index → name ("" / absent keeps it generic)
  merges: [number, number][]; // [from, into] — fold a duplicate speaker into another
  ignores: number[]; // speaker indices to drop entirely
}
