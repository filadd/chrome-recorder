// The cheap LLM pass that runs at callback time: guess each speaker's name from
// in-conversation cues so the review screen opens pre-filled. It is best-effort —
// a failure must NOT fail the callback (the human still names everyone), so the
// caller treats a throw as "no guesses".

import { chat, parseJsonReply } from "./llm";
import type { SpeakerGuess } from "./review";

const SYSTEM_PROMPT = [
  "You are given a diarized meeting transcript where each turn is prefixed `[speaker N]`.",
  "Infer each speaker's real name ONLY from conversational cues — self-introductions",
  '("my name is…", "this is…") or who is addressed by name. Do not invent names.',
  "Return a confidence in [0,1]; use an empty name with confidence 0 when unknown.",
  'Respond with ONLY JSON: {"speakers":[{"index":number,"name":string,"confidence":number}]}.',
].join(" ");

export const guessSpeakerNames = async (
  llmApiKey: string,
  transcriptText: string,
): Promise<SpeakerGuess[]> => {
  const reply = await chat(llmApiKey, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: transcriptText },
  ]);

  const parsed = parseJsonReply<{ speakers?: SpeakerGuess[] }>(reply);

  return (parsed.speakers ?? []).filter((s) => Number.isInteger(s.index));
};
