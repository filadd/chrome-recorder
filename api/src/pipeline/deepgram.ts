const LISTEN_ENDPOINT = "https://api.deepgram.com/v1/listen";

// nova-3, multilingual, diarized, with per-utterance segmentation — matches the
// transcription settings the old workflow used (spec §8).
const LISTEN_QUERY: Record<string, string> = {
  model: "nova-3",
  language: "multi",
  diarize: "true",
  punctuate: "true",
  utterances: "true",
  smart_format: "true",
};

// Deepgram POSTs the transcript to `callback` once it finishes processing, so the
// Lambda returns in milliseconds instead of blocking on the whole transcription.
export const buildListenUrl = (callbackUrl: string): string => {
  const params = new URLSearchParams(LISTEN_QUERY);
  params.set("callback", callbackUrl);

  return `${LISTEN_ENDPOINT}?${params.toString()}`;
};

// Hands Deepgram a presigned S3 URL to fetch the audio itself (keeps the Lambda
// memory-light) and returns the request_id from the immediate ack.
export const submitTranscription = async (
  apiKey: string,
  sourceUrl: string,
  callbackUrl: string,
): Promise<string> => {
  const response = await fetch(buildListenUrl(callbackUrl), {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram submit failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as { request_id?: string };

  return json.request_id ?? "";
};
