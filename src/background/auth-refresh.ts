import { RefreshRejectedError, refreshSessionToken } from "@filadd/phi-plus-core/dist/server";

import { clearSession, getSession, setSession } from "../shared/auth-session";
import { AUTH_BASE_URL } from "../shared/constants";

// Coalesces concurrent refreshes within a live SW: the start call, recovery, and the
// offscreen's mid-recording request all await the same in-flight refresh instead of
// each spending the single-use refresh token — spending it twice would trip the auth
// service's reuse detection and revoke the whole family.
let ongoingRefresh: Promise<string | null> | null = null;

const rotate = async (): Promise<string | null> => {
  const session = await getSession();

  if (session == null) {
    return null;
  }

  try {
    const refreshed = await refreshSessionToken(session.refreshToken, AUTH_BASE_URL);

    // The refresh response carries no email; keep the one from the login.
    await setSession({ ...refreshed, email: session.email });

    return refreshed.authToken;
  } catch (error) {
    // A rejected refresh token (revoked/expired/reused) means the session is dead —
    // clear it so the popup falls back to the login screen. A recoverable failure
    // (429/5xx) keeps the session for a later retry.
    if (error instanceof RefreshRejectedError) {
      await clearSession();
    }

    return null;
  }
};

// Returns a fresh `Bearer <JWT>` on success, or null when refresh is impossible (no
// session, or the refresh failed). On a hard rejection the session is cleared, so a
// caller that needs to distinguish "log in again" from a transient failure can re-read
// getSession() after a null result.
export const refreshSession = (): Promise<string | null> => {
  ongoingRefresh ??= rotate().finally(() => {
    ongoingRefresh = null;
  });

  return ongoingRefresh;
};
