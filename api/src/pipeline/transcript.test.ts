import { describe, expect, it } from "vitest";

import { formatTranscript } from "./transcript";

describe("formatTranscript", () => {
  it("renders one [speaker N] line per utterance", () => {
    const transcript = formatTranscript({
      results: {
        utterances: [
          { speaker: 0, transcript: "Hola, ¿cómo estás?" },
          { speaker: 1, transcript: "Bien, gracias." },
        ],
      },
    });

    expect(transcript).toBe("[speaker 0] Hola, ¿cómo estás?\n[speaker 1] Bien, gracias.");
  });

  it("defaults a missing speaker to 0 and trims text", () => {
    const transcript = formatTranscript({
      results: { utterances: [{ transcript: "  spaced  " }] },
    });

    expect(transcript).toBe("[speaker 0] spaced");
  });

  it("drops utterances with empty text", () => {
    const transcript = formatTranscript({
      results: {
        utterances: [
          { speaker: 0, transcript: "" },
          { speaker: 1, transcript: "real" },
        ],
      },
    });

    expect(transcript).toBe("[speaker 1] real");
  });

  it("falls back to the flat channel transcript without utterances", () => {
    const transcript = formatTranscript({
      results: { channels: [{ alternatives: [{ transcript: "plain text" }] }] },
    });

    expect(transcript).toBe("plain text");
  });

  it("returns an empty string when there is nothing to format", () => {
    expect(formatTranscript({})).toBe("");
  });
});
