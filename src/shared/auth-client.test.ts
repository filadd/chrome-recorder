import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthLoginError, requestEmailCode, verifyEmailCode } from "./auth-client";

beforeEach(() => {
  vi.stubGlobal("chrome", { i18n: { getUILanguage: () => "es-419" } });
});

afterEach(() => vi.unstubAllGlobals());

describe("requestEmailCode", () => {
  it("posts the init request with a base locale and resolves on 204", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestEmailCode("ana@filadd.com")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/auth/login/totp/code/init/");
    expect(JSON.parse(init.body as string)).toMatchObject({ email: "ana@filadd.com", locale: "es" });
  });

  it("throws AuthLoginError carrying the status on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));

    await expect(requestEmailCode("ana@filadd.com")).rejects.toBeInstanceOf(AuthLoginError);
    await expect(requestEmailCode("ana@filadd.com")).rejects.toMatchObject({ status: 429 });
  });
});

describe("verifyEmailCode", () => {
  it("maps the token response to a session that carries the email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              encoded_token: "jwt",
              expires_at: 10,
              refresh_token: "r",
              refresh_token_expires_at: 20,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    expect(await verifyEmailCode("ana@filadd.com", "123456")).toEqual({
      authToken: "Bearer jwt",
      expiresAt: 10,
      refreshToken: "r",
      refreshTokenExpiresAt: 20,
      email: "ana@filadd.com",
    });
  });

  it("throws AuthLoginError on a rejected code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));

    await expect(verifyEmailCode("ana@filadd.com", "000000")).rejects.toBeInstanceOf(AuthLoginError);
  });
});
