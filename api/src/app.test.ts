import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "./app";
import * as fu from "./file-uploads-client";
import { UpstreamHttpError } from "./file-uploads-client";
import * as gw from "./gateway-auth";
import { UnauthorizedError } from "./gateway-auth";

// Keep the real error classes (the routes/middleware map them via instanceof),
// replace only the network-touching functions.
vi.mock("./gateway-auth", async (importActual) => ({
  ...(await importActual<typeof import("./gateway-auth")>()),
  resolveUser: vi.fn(),
}));

vi.mock("./file-uploads-client", async (importActual) => ({
  ...(await importActual<typeof import("./file-uploads-client")>()),
  createMultipart: vi.fn(),
  recordPart: vi.fn(),
  getMultipart: vi.fn(),
  abortMultipart: vi.fn(),
}));

const PITCH = "0123456789abcdef0123456789abcdef";

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer jwt" },
    body: JSON.stringify(body),
  });

describe("stand-in upload routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DESTINATION_BUCKET = "filadd-chrome-recorder-prod";
    process.env.DESTINATION_PATH = "projects";
    vi.mocked(gw.resolveUser).mockResolvedValue({ email: "a@filadd.com" });
  });

  it("POST /uploads creates a session and returns the first presigned part", async () => {
    vi.mocked(fu.createMultipart).mockResolvedValue({
      key: "k.webm",
      filepath: "projects/k.webm",
      partNumber: 1,
      url: "https://s3/p1",
    });

    const res = await post("/uploads", { profileId: "project", pitchId: PITCH });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      key: "k.webm",
      filepath: "projects/k.webm",
      partNumber: 1,
      url: "https://s3/p1",
    });

    const config = vi.mocked(fu.createMultipart).mock.calls[0][0];
    expect(config.destination).toEqual({ bucket: "filadd-chrome-recorder-prod", path: "projects" });
    expect(config.metadata).toEqual({ pitch_id: PITCH, recorded_by: "a@filadd.com" });
    expect(config.content_type).toBe("video/webm");
  });

  it("POST /uploads rejects an absent/invalid JWT with 401", async () => {
    vi.mocked(gw.resolveUser).mockRejectedValue(new UnauthorizedError());

    const res = await post("/uploads", { profileId: "project", pitchId: PITCH });
    expect(res.status).toBe(401);
    expect(vi.mocked(fu.createMultipart)).not.toHaveBeenCalled();
  });

  it("POST /uploads validates pitchId and profile", async () => {
    expect((await post("/uploads", { profileId: "project" })).status).toBe(400);
    expect((await post("/uploads", { profileId: "project", pitchId: "nope" })).status).toBe(400);
    expect((await post("/uploads", { profileId: "ghost", pitchId: PITCH })).status).toBe(404);
  });

  it("POST /uploads/part records a part and returns the next URL", async () => {
    vi.mocked(fu.recordPart).mockResolvedValue({
      key: "k.webm",
      status: "PENDING",
      partNumber: 2,
      url: "https://s3/p2",
    });

    const res = await post("/uploads/part", { key: "k.webm", partNumber: 1, etag: "e1" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      key: "k.webm",
      status: "PENDING",
      partNumber: 2,
      url: "https://s3/p2",
    });
  });

  it("POST /uploads/part with complete:true returns ASSEMBLING", async () => {
    vi.mocked(fu.recordPart).mockResolvedValue({
      key: "k.webm",
      status: "ASSEMBLING",
      partNumber: null,
      url: null,
    });

    const res = await post("/uploads/part", { key: "k.webm", partNumber: 3, etag: "e3", complete: true });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "ASSEMBLING" });
  });

  it("forwards file-uploads 4xx (409 non-PENDING, 422 non-consecutive)", async () => {
    vi.mocked(fu.recordPart).mockRejectedValueOnce(new UpstreamHttpError(422, { code: "bad" }));
    expect((await post("/uploads/part", { key: "k.webm", partNumber: 9, etag: "e" })).status).toBe(422);

    vi.mocked(fu.recordPart).mockRejectedValueOnce(
      new UpstreamHttpError(409, { code: "multipart_session_not_pending" }),
    );
    expect((await post("/uploads/part", { key: "k.webm", partNumber: 1, etag: "e" })).status).toBe(409);
  });

  it("GET /uploads/:key passes through status + parts", async () => {
    vi.mocked(fu.getMultipart).mockResolvedValue({
      configuration: {},
      status: "COMPLETED",
      parts: [{ part_number: 1, etag: "e1" }],
    });

    const res = await app.request("/uploads/k.webm", { headers: { Authorization: "Bearer jwt" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("DELETE /uploads/:key aborts with 204", async () => {
    vi.mocked(fu.abortMultipart).mockResolvedValue(undefined);

    const res = await app.request("/uploads/k.webm", {
      method: "DELETE",
      headers: { Authorization: "Bearer jwt" },
    });
    expect(res.status).toBe(204);
    expect(vi.mocked(fu.abortMultipart)).toHaveBeenCalledWith("k.webm");
  });
});
