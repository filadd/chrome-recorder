// Reuses the Filadd web session: auth-user stores the JWT client-side in the
// non-httpOnly cookie `auth._token.local` ("Bearer <jwt>", URL-encoded), which
// both filadd frontends read for their Authorization headers (see spec §5).
const AUTH_COOKIE_URL = "https://filadd.com";
const AUTH_COOKIE_NAME = "auth._token.local";
const LOGIN_URL = "https://filadd.com/auth/login";

export interface FiladdAuth {
  token: string;
  userId: number | null;
}

const decodeUserId = (jwt: string): number | null => {
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

    return typeof payload.user_id === "number" ? payload.user_id : null;
  } catch {
    return null;
  }
};

export const getFiladdAuth = async (): Promise<FiladdAuth | null> => {
  const cookie = await chrome.cookies.get({ url: AUTH_COOKIE_URL, name: AUTH_COOKIE_NAME });

  if (cookie == null || cookie.value === "") {
    return null;
  }

  const token = decodeURIComponent(cookie.value);

  if (!token.startsWith("Bearer ")) {
    return null;
  }

  return { token, userId: decodeUserId(token.slice("Bearer ".length)) };
};

export const openFiladdLogin = (): void => {
  chrome.tabs.create({ url: LOGIN_URL });
};

// Fires on login/logout in any filadd.com tab — lets the popup flip to
// logged-in the moment auth-user writes the cookie, no redirect plumbing.
export const onFiladdAuthChange = (listener: () => void): (() => void) => {
  const handler = (info: chrome.cookies.CookieChangeInfo): void => {
    if (info.cookie.name === AUTH_COOKIE_NAME && info.cookie.domain.includes("filadd.com")) {
      listener();
    }
  };

  chrome.cookies.onChanged.addListener(handler);
  return () => chrome.cookies.onChanged.removeListener(handler);
};
