import type { AuthSession } from "@filadd/phi-plus-core/dist/server";

// The extension owns its own login (email code) and its own token family, stored in
// chrome.storage.local — never a filadd.com cookie. The popup writes the session on
// login; the service worker reads it for gateway calls and rewrites it on refresh.
// The offscreen doc can't read storage, so the SW passes the token by message.
//
// `email` is kept alongside the core AuthSession fields because the refresh response
// doesn't repeat it, and the settings screen shows who is signed in.
export interface StoredSession extends AuthSession {
  email: string;
}

export const getSession = async (): Promise<StoredSession | null> =>
  (await chrome.storage.local.get<{ authSession?: StoredSession }>("authSession")).authSession ??
  null;

export const setSession = (authSession: StoredSession): Promise<void> =>
  chrome.storage.local.set({ authSession });

export const clearSession = (): Promise<void> => chrome.storage.local.remove("authSession");

export const getAccessToken = async (): Promise<string | null> =>
  (await getSession())?.authToken ?? null;
