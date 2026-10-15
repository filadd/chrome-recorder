import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@filadd/phi-plus-core/dist/server", () => {
  class RefreshRejectedError extends Error {}

  return { RefreshRejectedError, refreshSessionToken: vi.fn() };
});

vi.mock("../shared/auth-session", () => ({
  getSession: vi.fn(),
  setSession: vi.fn(async () => undefined),
  clearSession: vi.fn(async () => undefined),
}));

import { RefreshRejectedError, refreshSessionToken } from "@filadd/phi-plus-core/dist/server";

import { clearSession, getSession, setSession } from "../shared/auth-session";
import { refreshSession } from "./auth-refresh";

const mockedRefresh = vi.mocked(refreshSessionToken);
const mockedGet = vi.mocked(getSession);

const stored = {
  authToken: "Bearer old",
  expiresAt: 1,
  refreshToken: "r0",
  refreshTokenExpiresAt: 2,
  email: "ana@filadd.com",
};

const rotated = { authToken: "Bearer new", expiresAt: 3, refreshToken: "r1", refreshTokenExpiresAt: 4 };

beforeEach(() => vi.clearAllMocks());

describe("refreshSession", () => {
  it("returns null and never calls the auth service without a session", async () => {
    mockedGet.mockResolvedValue(null);

    expect(await refreshSession()).toBeNull();
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("stores the rotated pair (keeping the email) and returns the new token", async () => {
    mockedGet.mockResolvedValue(stored);
    mockedRefresh.mockResolvedValue(rotated);

    expect(await refreshSession()).toBe("Bearer new");
    expect(setSession).toHaveBeenCalledWith({ ...rotated, email: "ana@filadd.com" });
  });

  it("clears the session on a hard rejection", async () => {
    mockedGet.mockResolvedValue(stored);
    mockedRefresh.mockRejectedValue(new RefreshRejectedError("rejected"));

    expect(await refreshSession()).toBeNull();
    expect(clearSession).toHaveBeenCalledOnce();
  });

  it("keeps the session on a recoverable failure", async () => {
    mockedGet.mockResolvedValue(stored);
    mockedRefresh.mockRejectedValue(new Error("503"));

    expect(await refreshSession()).toBeNull();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("coalesces concurrent callers into one refresh", async () => {
    mockedGet.mockResolvedValue(stored);
    mockedRefresh.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));

      return rotated;
    });

    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);

    expect(a).toBe("Bearer new");
    expect(b).toBe("Bearer new");
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });
});
