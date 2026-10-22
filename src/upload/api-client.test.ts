import { afterEach, describe, expect, it, vi } from "vitest";

import { EXPIRED_TOKEN_ERROR_CODE } from "@filadd/phi-plus-core/dist/server";

import { ApiError, createUpload } from "./api-client";

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const created = { key: "k", filepath: "f", partNumber: 1, url: "u" };
const payload = { profileId: "project", pitchId: "p" } as const;

afterEach(() => vi.unstubAllGlobals());

describe("api-client onExpiredToken retry", () => {
  it("refreshes once and replays the request with the fresh token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ code: EXPIRED_TOKEN_ERROR_CODE }, 401))
      .mockResolvedValueOnce(json(created, 200));
    vi.stubGlobal("fetch", fetchMock);
    const onExpiredToken = vi.fn(async () => "Bearer fresh");

    expect(await createUpload(payload, "Bearer old", onExpiredToken)).toEqual(created);
    expect(onExpiredToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer fresh",
    });
  });

  it("never retries more than once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ code: EXPIRED_TOKEN_ERROR_CODE }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const onExpiredToken = vi.fn(async () => "Bearer fresh");

    await expect(createUpload(payload, "Bearer old", onExpiredToken)).rejects.toThrow();
    expect(onExpiredToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a non-401 failure without refreshing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "boom" }, 500)));
    const onExpiredToken = vi.fn();

    await expect(createUpload(payload, "t", onExpiredToken)).rejects.toMatchObject({ status: 500 });
    expect(onExpiredToken).not.toHaveBeenCalled();
  });

  it("throws a 401 without the expired_token code without refreshing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "other" }, 401)));
    const onExpiredToken = vi.fn();

    await expect(createUpload(payload, "t", onExpiredToken)).rejects.toThrow();
    expect(onExpiredToken).not.toHaveBeenCalled();
  });

  it("gives up when the refresh yields no token", async () => {
    const fetchMock = vi.fn(async () => json({ code: EXPIRED_TOKEN_ERROR_CODE }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const onExpiredToken = vi.fn(async () => null);

    await expect(createUpload(payload, "t", onExpiredToken)).rejects.toBeInstanceOf(ApiError);
    expect(onExpiredToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
