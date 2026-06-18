// Thin proxy over transcript-api's diarized transcription (the Deepgram nova-3 path
// lives there, not in ai-conversations). The stand-in enqueues an async job with a
// presigned audio URL, then polls until the worker resolves it — mirroring what
// n8n's "enqueue, then poll" Processing flow will do.

export const TRANSCRIPTION_STATUS = {
  pending: "pending",
  processing: "processing",
  done: "done",
  failed: "failed",
} as const;

export type TranscriptionStatus =
  (typeof TRANSCRIPTION_STATUS)[keyof typeof TRANSCRIPTION_STATUS];

export interface DiarizedSegment {
  speaker: number;
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface DiarizedOutput {
  type: "diarized";
  language: string;
  segments: DiarizedSegment[];
}

interface TranscriptionResponse {
  status: TranscriptionStatus;
  id: string | null;
  strategy: string | null;
  output: DiarizedOutput | null;
}

export class TranscriptUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptUnavailableError";
  }
}

export class TranscriptFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptFailedError";
  }
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const baseUrl = (): string => {
  const url = process.env.TRANSCRIPT_API_URL;

  if (url == null || url === "") {
    throw new Error("TRANSCRIPT_API_URL is not configured");
  }

  return url.replace(/\/$/, "");
};

const request = async (method: string, path: string, body?: unknown): Promise<TranscriptionResponse> => {
  let res: Response;

  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: body != null ? { "Content-Type": "application/json" } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new TranscriptUnavailableError(`transcript-api unreachable: ${error}`);
  }

  if (!res.ok) {
    throw new TranscriptUnavailableError(`transcript-api responded ${res.status}`);
  }

  return res.json() as Promise<TranscriptionResponse>;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Enqueue a diarized job and poll to resolution. The recordings are long-form, so
// async (enqueue + poll) avoids the HTTP timeout a sync call would hit.
export const transcribeDiarized = async (audioUrl: string): Promise<DiarizedOutput> => {
  const created = await request("POST", "/api/transcription/", {
    audio_url: audioUrl,
    strategy: "diarized",
    mode: "async",
  });

  if (created.id == null) {
    throw new TranscriptFailedError("transcript-api returned no task id for an async job");
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const polled = await request("GET", `/api/transcription/${encodeURIComponent(created.id)}/`);

    if (polled.status === TRANSCRIPTION_STATUS.done && polled.output != null) {
      return polled.output;
    }

    if (polled.status === TRANSCRIPTION_STATUS.failed) {
      throw new TranscriptFailedError(`transcription ${created.id} failed`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new TranscriptFailedError(`transcription ${created.id} did not resolve within the timeout`);
};
