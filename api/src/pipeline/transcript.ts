// Minimal shape of the Deepgram pre-recorded response we depend on. With
// `utterances=true` Deepgram returns one entry per speaker turn; we fall back to
// the flat channel transcript when diarization/utterances are absent.
export interface DeepgramResponse {
  results?: {
    utterances?: { speaker?: number; transcript?: string }[];
    channels?: { alternatives?: { transcript?: string }[] }[];
  };
}

// Formats the diarized result as `[speaker N] text` lines — the format the old
// workflow produced and downstream prompts expect.
export const formatTranscript = (response: DeepgramResponse): string => {
  const utterances = response.results?.utterances ?? [];

  if (utterances.length > 0) {
    return utterances
      .map((u) => `[speaker ${u.speaker ?? 0}] ${(u.transcript ?? "").trim()}`)
      .filter((line) => line.replace(/^\[speaker \d+\]\s*/, "") !== "")
      .join("\n");
  }

  return (response.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
};
