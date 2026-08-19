import type { StoredSession } from "./auth-session";
import { AUTH_BASE_URL, AUTH_CONTINUE_URL } from "./constants";

// The auth service returns the token pair in the response body. Names match the
// service's EncodedTokenResponse (kept for legacy clients — `encoded_token` is the
// access token).
interface EncodedTokenResponse {
  encoded_token: string;
  expires_at: number;
  refresh_token: string;
  refresh_token_expires_at: number;
}

// Thrown when the auth service rejects a login step (bad/expired code, unknown email,
// rate limit). Carries the HTTP status so the UI can tell "wrong code" (4xx) from
// "too many requests" (429).
export class AuthLoginError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// chrome.i18n gives a BCP-47 UI language (`es-419`, `pt-BR`, `en-US`); the auth service
// expects a base language. Fall back to Spanish, the extension default.
const resolveLocale = (): string => {
  const base = chrome.i18n.getUILanguage().split("-")[0];

  return ["es", "en", "pt"].includes(base) ? base : "es";
};

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${AUTH_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Step 1 of login: ask the auth service to email a 6-digit code. `continue_url` is
// required and allowlist-validated, but this flow reads the tokens from the body so it
// is never redirected to. Resolves on the 204; throws AuthLoginError otherwise.
export const requestEmailCode = async (email: string): Promise<void> => {
  const res = await post("/auth/login/totp/code/init/", {
    email,
    continue_url: AUTH_CONTINUE_URL,
    locale: resolveLocale(),
  });

  if (!res.ok) {
    throw new AuthLoginError(`Code request failed: ${res.status}`, res.status);
  }
};

// Step 2 of login: exchange the emailed code for the token pair, mapped to a
// StoredSession that carries the email (the refresh response won't repeat it).
export const verifyEmailCode = async (email: string, code: string): Promise<StoredSession> => {
  const res = await post("/auth/login/totp/code/verify/", { email, totp_code: code });

  if (!res.ok) {
    throw new AuthLoginError(`Code verification failed: ${res.status}`, res.status);
  }

  const body = (await res.json()) as EncodedTokenResponse;

  return {
    authToken: `Bearer ${body.encoded_token}`,
    expiresAt: body.expires_at,
    refreshToken: body.refresh_token,
    refreshTokenExpiresAt: body.refresh_token_expires_at,
    email,
  };
};
