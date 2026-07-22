import { AUTH_COOKIE_URL } from "./constants";

// The extension authenticates as the real Filadd user: the `auth._token.local`
// cookie (set by the Filadd frontend after login) holds the full `Bearer <JWT>`
// string, used as the Authorization header to the gateway, which validates it and
// injects `X-UserId` for chrome-recorder-consumer-api.
//
// The cookie is stored URL-encoded (the scheme/token space is `%20`), so it must
// be decoded before use — the gateway can't parse `Bearer%20<JWT>`.
//
// Read in the service worker (and recovery), NEVER the offscreen document —
// offscreen docs can only use chrome.runtime, not chrome.cookies. The SW threads
// the token to the offscreen via the start-capture message.
export const AUTH_COOKIE_NAME = "auth._token.local";

const nonEmpty = (value: string | undefined): value is string => value != null && value.trim() !== "";

// decodeURIComponent is idempotent for an already-decoded value (no `%` sequences
// in a `Bearer <JWT>` string), so it's safe whether or not the cookie is encoded.
const decodeToken = (value: string): string => decodeURIComponent(value);

// With AUTH_COOKIE_URL set (the common case — local testing reads the token from
// localhost, prod from the app origin), read the cookie from exactly that origin
// so a stray cookie on another domain can't be picked instead. When it's blank,
// fall back to scanning every host-permission origin.
export const getAuthToken = async (): Promise<string | null> => {
  if (AUTH_COOKIE_URL !== "") {
    const cookie = await chrome.cookies.get({ url: AUTH_COOKIE_URL, name: AUTH_COOKIE_NAME });

    return nonEmpty(cookie?.value) ? decodeToken(cookie!.value) : null;
  }

  const cookies = await chrome.cookies.getAll({ name: AUTH_COOKIE_NAME });
  const value = cookies.find((cookie) => nonEmpty(cookie.value))?.value;

  return value != null ? decodeToken(value) : null;
};
