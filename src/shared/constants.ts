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

// The local n8n stand-in (api/). Auth is the per-user `auth._token.local` JWT read
// from the cookie at runtime (see src/shared/auth-token.ts), not a static token.
// Configured via the root `.env` (VITE_API_BASE_URL); falls back to the local default.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

// Origin to read the `auth._token.local` cookie from. For local testing the token
// is set on the local frontend (localhost), not on filadd.com — point this at it.
// Set VITE_AUTH_COOKIE_URL="" to instead scan every host-permission origin.
export const AUTH_COOKIE_URL = import.meta.env.VITE_AUTH_COOKIE_URL ?? "http://localhost:3000";

// How long to poll for the assembled upload to reach a terminal state after the
// final part is submitted (file-uploads assembles + validates + moves on Celery).
export const UPLOAD_POLL_INTERVAL_MS = 2_000;
export const UPLOAD_POLL_MAX_ATTEMPTS = 45;

export const LEAVE_DEBOUNCE_MS = 1_500;
export const FINISHED_RESET_MS = 8_000;
