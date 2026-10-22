export const MEET_SLUG_REGEX = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:[?#/]|$)/i;

export const RECORDING_MIME_TYPE = "audio/webm;codecs=opus";
export const AUDIO_BITS_PER_SECOND = 64_000;
export const RECORDER_TIMESLICE_MS = 3_000;

// S3 multipart minimum is 5 MiB for every part except the last; parts are cut as
// soon as the buffer crosses this floor so the unflushed tail stays minimal.
export const PART_SIZE_BYTES = 5 * 1024 * 1024;

export const UPLOAD_MAX_ATTEMPTS = 6;
export const UPLOAD_BACKOFF_BASE_MS = 1_000;
export const UPLOAD_BACKOFF_CAP_MS = 30_000;

// The Filadd gateway origin the extension uploads through. Auth is the per-user
// access token from the extension's own email-code login (see src/shared/auth-session.ts),
// stored in chrome.storage — not read from any filadd.com cookie. Configured via the
// root `.env` (VITE_API_BASE_URL); falls back to the local gateway. The gateway validates
// the JWT, injects `X-UserId`, and proxies to chrome-recorder-consumer-api.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// Gateway route prefix for the consumer API. The gateway strips `/api` and matches
// `/chrome-recorder/uploads…` → chrome-recorder-consumer-api's `/api/uploads…`.
export const API_PATH_PREFIX = "/api/chrome-recorder";

// The Filadd auth service origin. The extension logs in and refreshes directly against
// it (not through the gateway): `/auth/login/totp/code/{init,verify}/` and
// `/auth/token/refresh/`. Configured via VITE_AUTH_BASE_URL; falls back to the local
// auth service.
export const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL ?? "http://auth-service.docker";

// A `continue_url` is required by the auth login endpoints and validated against the
// service's host allowlist (filadd.com family / localhost). This flow reads the tokens
// from the response body, so the URL is never redirected to — it only has to be an
// allowlisted host.
export const AUTH_CONTINUE_URL = import.meta.env.VITE_AUTH_CONTINUE_URL ?? "http://localhost:3000";

// How long to poll for the assembled upload to reach a terminal state after the
// final part is submitted (file-uploads assembles + validates + moves on Celery).
export const UPLOAD_POLL_INTERVAL_MS = 2_000;
export const UPLOAD_POLL_MAX_ATTEMPTS = 45;

export const LEAVE_DEBOUNCE_MS = 1_500;
export const FINISHED_RESET_MS = 8_000;
