import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSession,
  getAccessToken,
  getSession,
  setSession,
  type StoredSession,
} from "./auth-session";

const store: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of Object.keys(store)) {
    delete store[key];
  }

  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

const session: StoredSession = {
  authToken: "Bearer abc",
  expiresAt: 1,
  refreshToken: "r",
  refreshTokenExpiresAt: 2,
  email: "ana@filadd.com",
};

describe("auth-session", () => {
  it("returns null when nothing is stored", async () => {
    expect(await getSession()).toBeNull();
    expect(await getAccessToken()).toBeNull();
  });

  it("round-trips the session and exposes the access token", async () => {
    await setSession(session);

    expect(await getSession()).toEqual(session);
    expect(await getAccessToken()).toBe("Bearer abc");
  });

  it("clears the session", async () => {
    await setSession(session);
    await clearSession();

    expect(await getSession()).toBeNull();
    expect(await getAccessToken()).toBeNull();
  });
});
