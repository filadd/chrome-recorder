import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GatewayUnavailableError, resolveUser, UnauthorizedError } from "./gateway-auth";

const okJson = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const errStatus = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as Response;

describe("resolveUser", () => {
  beforeEach(() => {
    process.env.GATEWAY_URL = "http://gateway.test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts email from the legacy { user: { email } } wrapper (the default shape)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ user: { email: "a@filadd.com" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveUser("Bearer jwt")).resolves.toEqual({ email: "a@filadd.com" });
    expect(fetchMock).toHaveBeenCalledWith("http://gateway.test/api/user/me/", {
      headers: { Authorization: "Bearer jwt" },
    });
  });

  it("extracts email from the flat expanded shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson({ email: "b@filadd.com" })));

    await expect(resolveUser("Bearer jwt")).resolves.toEqual({ email: "b@filadd.com" });
  });

  it("throws UnauthorizedError on a missing header", async () => {
    await expect(resolveUser(undefined)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(resolveUser("")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError on a 401/403 from the gateway", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errStatus(401)));
    await expect(resolveUser("Bearer bad")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws GatewayUnavailableError on a 5xx or a fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errStatus(503)));
    await expect(resolveUser("Bearer jwt")).rejects.toBeInstanceOf(GatewayUnavailableError);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(resolveUser("Bearer jwt")).rejects.toBeInstanceOf(GatewayUnavailableError);
  });
});
