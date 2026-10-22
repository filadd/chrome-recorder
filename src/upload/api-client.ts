import { EXPIRED_TOKEN_ERROR_CODE } from "@filadd/phi-plus-core/dist/server";

import type { ProfileId } from "../profiles/types";
import { API_BASE_URL, API_PATH_PREFIX } from "../shared/constants";

// Resolves a fresh `Bearer <JWT>` when the current one has expired, or null when a
// refresh isn't possible. The SW binds this to its own token refresh; the offscreen
// doc binds it to a request-fresh-token round-trip with the SW (it can't refresh
// itself). Passing it is what lets a call survive an access-token expiry mid-recording.
export type OnExpiredToken = () => Promise<string | null>;

// Carries the HTTP status so a caller can tell a vanished upload (404) from an auth
// or transient failure, which it may want to retry later instead.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// The token is the full `Bearer <JWT>` string, sent verbatim as Authorization. Paths
// carry a trailing slash and the `/api/chrome-recorder` gateway prefix.
const request = async <T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  onExpiredToken?: OnExpiredToken,
  retried = false,
): Promise<T> => {
  const res = await fetch(`${API_BASE_URL}${API_PATH_PREFIX}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const text = await res.text();

  // The gateway answers an expired access token with 401 + `code: "expired_token"`.
  // Refresh once and replay with the fresh token; a second expiry (or any other
  // failure) falls through to the throw.
  if (res.status === 401 && !retried && onExpiredToken != null && isExpiredToken(text)) {
    const fresh = await onExpiredToken();

    if (fresh != null) {
      return request(method, path, fresh, body, onExpiredToken, true);
    }
  }

  throw new ApiError(`API ${method} ${path} failed: ${res.status} ${text}`, res.status);
};

const isExpiredToken = (body: string): boolean => {
  try {
    return (JSON.parse(body) as { code?: string }).code === EXPIRED_TOKEN_ERROR_CODE;
  } catch {
    return false;
  }
};

// The multipart session status, owned by file-uploads-api (Redis). PENDING while
// parts upload; ASSEMBLING during CompleteMultipartUpload + post-processing; then a
// terminal state. Mirrored as a const map so callers compare against names.
export const UPLOAD_STATUS = {
  pending: "PENDING",
  assembling: "ASSEMBLING",
  completed: "COMPLETED",
  aborted: "ABORTED",
  validationError: "VALIDATION_ERROR",
  transcodingError: "TRANSCODING_ERROR",
  uploadError: "UPLOAD_ERROR",
} as const;

export type UploadStatus = (typeof UPLOAD_STATUS)[keyof typeof UPLOAD_STATUS];

export interface CreateUploadResult {
  key: string;
  filepath: string;
  partNumber: number;
  url: string;
}

export interface RecordPartResult {
  key: string;
  status: UploadStatus;
  partNumber: number | null;
  url: string | null;
}

export interface UploadStatusResult {
  status: UploadStatus;
  parts: { part_number: number; etag: string }[];
}

export const createUpload = (
  payload: { profileId: ProfileId; pitchId: string },
  token: string,
  onExpiredToken?: OnExpiredToken,
): Promise<CreateUploadResult> => request("POST", "/uploads/", token, payload, onExpiredToken);

export const recordPart = (
  input: { key: string; partNumber: number; etag: string; complete?: boolean },
  token: string,
  onExpiredToken?: OnExpiredToken,
): Promise<RecordPartResult> => request("POST", "/uploads/part/", token, input, onExpiredToken);

export const getUploadStatus = (
  key: string,
  token: string,
  onExpiredToken?: OnExpiredToken,
): Promise<UploadStatusResult> =>
  request("GET", `/uploads/${encodeURIComponent(key)}/`, token, undefined, onExpiredToken);

export const abortUpload = (
  key: string,
  token: string,
  onExpiredToken?: OnExpiredToken,
): Promise<void> =>
  request("DELETE", `/uploads/${encodeURIComponent(key)}/`, token, undefined, onExpiredToken);
