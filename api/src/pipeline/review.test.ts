import { describe, expect, it } from "vitest";

import {
  applyNaming,
  bestGuessNaming,
  buildSpeakers,
  linesToText,
  parseReviewKey,
  reviewKey,
  toTranscriptLines,
  type ReviewArtifact,
  type TranscriptLine,
} from "./review";

const PITCH_ID = "667c67371f6544719c3c50258bdbfe65";

describe("toTranscriptLines", () => {
  it("maps diarized utterances, dropping empty ones", () => {
    const lines = toTranscriptLines({
      results: {
        utterances: [
          { speaker: 0, transcript: "Hello there", start: 1 },
          { speaker: 1, transcript: "  ", start: 2 },
          { speaker: 1, transcript: "Hi", start: 3 },
        ],
      },
    });

    expect(lines).toEqual([
      { speaker: 0, text: "Hello there", start: 1 },
      { speaker: 1, text: "Hi", start: 3 },
    ]);
  });

  it("falls back to the flat channel transcript as a single speaker", () => {
    const lines = toTranscriptLines({
      results: { channels: [{ alternatives: [{ transcript: "just one block" }] }] },
    });

    expect(lines).toEqual([{ speaker: 0, text: "just one block", start: 0 }]);
  });

  it("returns nothing for an empty response", () => {
    expect(toTranscriptLines({})).toEqual([]);
  });
});

describe("buildSpeakers", () => {
  const lines: TranscriptLine[] = [
    { speaker: 0, text: "one two three four five", start: 0 },
    { speaker: 1, text: "hi", start: 1 },
    { speaker: 0, text: "more words here now", start: 2 },
  ];

  it("aggregates word counts and orders by who spoke most", () => {
    const speakers = buildSpeakers(lines, []);

    expect(speakers.map((s) => s.index)).toEqual([0, 1]);
    expect(speakers[0].wordCount).toBe(9);
    expect(speakers[1].wordCount).toBe(1);
  });

  it("folds in guesses by speaker index", () => {
    const speakers = buildSpeakers(lines, [{ index: 1, name: "Beto", confidence: 0.9 }]);

    expect(speakers.find((s) => s.index === 1)).toMatchObject({ guess: "Beto", confidence: 0.9 });
    expect(speakers.find((s) => s.index === 0)?.guess).toBe("");
  });
});

describe("review key round-trip", () => {
  it("encodes pitchId + createdAt and parses them back", () => {
    const artifact = {
      id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
      pitchId: PITCH_ID,
      recordedBy: "ana@filadd.com",
      createdAt: "2026-06-08T12:00:00.000Z",
    };

    const key = reviewKey(artifact);
    const parsed = parseReviewKey(key);

    expect(key.startsWith("reviews/ana-filadd.com/")).toBe(true);
    expect(parsed).toEqual({ key, pitchId: PITCH_ID, createdAt: "2026-06-08T12:00:00.000Z" });
  });

  it("rejects non-review keys", () => {
    expect(parseReviewKey("projects/x.webm")).toBeNull();
  });
});

describe("applyNaming", () => {
  const transcript: TranscriptLine[] = [
    { speaker: 0, text: "intro", start: 0 },
    { speaker: 1, text: "question", start: 1 },
    { speaker: 2, text: "noise", start: 2 },
    { speaker: 3, text: "follow up", start: 3 },
  ];

  it("labels named speakers and keeps unknowns generic", () => {
    const result = applyNaming(transcript, { names: { 0: "Ana" }, merges: [], ignores: [] });

    expect(result.text).toContain("Ana: intro");
    expect(result.text).toContain("[speaker 1] question");
    expect(result.participants).toBe("Ana");
  });

  it("drops ignored speakers and merges duplicates", () => {
    const result = applyNaming(transcript, {
      names: { 0: "Ana" },
      merges: [[3, 0]],
      ignores: [2],
    });

    expect(result.text).not.toContain("noise");
    expect(result.text).toContain("Ana: follow up");
    expect(result.participants).toBe("Ana");
  });
});

describe("bestGuessNaming", () => {
  it("keeps only confident guesses", () => {
    const artifact = {
      speakers: [
        { index: 0, guess: "Ana", confidence: 0.9, samples: [], wordCount: 10 },
        { index: 1, guess: "Maybe", confidence: 0.3, samples: [], wordCount: 5 },
      ],
    } as unknown as ReviewArtifact;

    expect(bestGuessNaming(artifact).names).toEqual({ 0: "Ana" });
  });
});

describe("linesToText", () => {
  it("renders [speaker N] lines", () => {
    expect(linesToText([{ speaker: 2, text: "hey", start: 0 }])).toBe("[speaker 2] hey");
  });
});
