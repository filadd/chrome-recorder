import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abortMultipart,
  createMultipart,
  getMultipart,
  recordPart,
  UpstreamHttpError,
  type MultipartConfig,
} from "./file-uploads-client";

const json = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const config: MultipartConfig = {
  destination: { bucket: "filadd-chrome-recorder-prod", path: "projects" },
  allowed_mimetypes: ["video/webm"],
  constraints: [],
  transcoding: null,
  max_size: null,
  file_extension: ".webm",
  content_type: "video/webm",
  metadata: { pitch_id: "abc", recorded_by: "a@filadd.com" },
};

describe("file-uploads-client", () => {
  beforeEach(() => {
    process.env.FILE_UPLOADS_API_URL = "http://fu.test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createMultipart posts the config and maps part_number → partNumber", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(201, { key: "k.webm", filepath: "projects/k.webm", part_number: 1, url: "https://s3/p1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createMultipart(config)).resolves.toEqual({
      key: "k.webm",
      filepath: "projects/k.webm",
      partNumber: 1,
      url: "https://s3/p1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://fu.test/api/presigned-multipart-upload/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(config);
  });

  it("recordPart maps snake_case request + response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(200, { key: "k.webm", status: "PENDING", part_number: 2, url: "https://s3/p2" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(recordPart({ key: "k.webm", partNumber: 1, etag: "e1" })).resolves.toEqual({
      key: "k.webm",
      status: "PENDING",
      partNumber: 2,
      url: "https://s3/p2",
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      key: "k.webm",
      part_number: 1,
      etag: "e1",
      complete: false,
    });
  });

  it("recordPart forwards complete:true", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(200, { key: "k.webm", status: "ASSEMBLING", part_number: null, url: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      recordPart({ key: "k.webm", partNumber: 3, etag: "e3", complete: true }),
    ).resolves.toEqual({ key: "k.webm", status: "ASSEMBLING", partNumber: null, url: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).complete).toBe(true);
  });

  it("getMultipart returns the status payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(200, { configuration: {}, status: "COMPLETED", parts: [] })),
    );

    await expect(getMultipart("k.webm")).resolves.toEqual({
      configuration: {},
      status: "COMPLETED",
      parts: [],
    });
  });

  it("abortMultipart resolves on 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 } as Response));
    await expect(abortMultipart("k.webm")).resolves.toBeUndefined();
  });

  it("throws UpstreamHttpError with the status on a non-2xx (409/422)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(409, { code: "multipart_session_not_pending" })));

    await expect(recordPart({ key: "k.webm", partNumber: 1, etag: "e1" })).rejects.toMatchObject({
      name: "UpstreamHttpError",
      status: 409,
    });
    await expect(recordPart({ key: "k.webm", partNumber: 1, etag: "e1" })).rejects.toBeInstanceOf(
      UpstreamHttpError,
    );
  });
});
