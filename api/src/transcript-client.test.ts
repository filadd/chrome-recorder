import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TranscriptFailedError, transcribeDiarized } from "./transcript-client";

const json = (body: unknown): Response => ({ ok: true, status: 200, json: async () => body }) as Response;

describe("transcribeDiarized", () => {
  beforeEach(() => {
    process.env.TRANSCRIPT_API_URL = "http://transcript.test";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("enqueues an async job and polls until done", async () => {
    const output = { type: "diarized", language: "en", segments: [{ speaker: 0, text: "hi", start_ms: 0, end_ms: 10 }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ status: "pending", id: "t1", strategy: "diarized", output: null }))
      .mockResolvedValueOnce(json({ status: "processing", id: "t1", strategy: "diarized", output: null }))
      .mockResolvedValueOnce(json({ status: "done", id: "t1", strategy: "diarized", output }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = transcribeDiarized("https://s3/audio.webm");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual(output);
    expect(fetchMock.mock.calls[0][0]).toBe("http://transcript.test/api/transcription/");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ strategy: "diarized", mode: "async" });
    expect(fetchMock.mock.calls[1][0]).toBe("http://transcript.test/api/transcription/t1/");
  });

  it("throws when the job resolves to failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ status: "pending", id: "t1", strategy: "diarized", output: null }))
        .mockResolvedValueOnce(json({ status: "failed", id: "t1", strategy: "diarized", output: null })),
    );

    const promise = transcribeDiarized("https://s3/audio.webm");
    const assertion = expect(promise).rejects.toBeInstanceOf(TranscriptFailedError);
    await vi.runAllTimersAsync();
    await assertion;
  });
});
