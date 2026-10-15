import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/auth-session", () => ({ getSession: vi.fn() }));

import { getSession } from "../shared/auth-session";
import { resolveStartFailure } from "./resolve-start-failure";
import { NOT_SIGNED_IN_MESSAGE, START_RESULT_STATUS } from "./start-result";

const mockedGet = vi.mocked(getSession);

beforeEach(() => vi.clearAllMocks());

describe("resolveStartFailure", () => {
  it("asks to log in again when the failure cleared the session", async () => {
    mockedGet.mockResolvedValue(null);

    expect(await resolveStartFailure(new Error("API POST /uploads/ failed: 401"))).toEqual({
      status: START_RESULT_STATUS.needsAuth,
      message: NOT_SIGNED_IN_MESSAGE,
    });
  });

  it("reports the error itself while the session is still alive", async () => {
    mockedGet.mockResolvedValue({
      authToken: "Bearer t",
      expiresAt: 1,
      refreshToken: "r",
      refreshTokenExpiresAt: 2,
      email: "ana@filadd.com",
    });

    expect(await resolveStartFailure(new Error("boom"))).toEqual({
      status: START_RESULT_STATUS.error,
      message: "Error: boom",
    });
  });
});
