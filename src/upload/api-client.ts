import type { ProfileId } from "../profiles/types";
import { API_BASE_URL } from "../shared/constants";

// The `auth._token.local` cookie value is already the full `Bearer <JWT>` string,
// so it is sent verbatim as Authorization. The offscreen doc can't read the cookie,
// so the token is always passed in by the caller (the SW reads it once).
const request = async <T>(method: string, path: string, token: string, body?: unknown): Promise<T> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }

  return (res.status === 204 ? undefined : await res.json()) as T;
};

export interface CreateUploadResult {
  key: string;
  filepath: string;
  partNumber: number;
  url: string;
}

export interface RecordPartResult {
  key: string;
  status: string;
  partNumber: number | null;
  url: string | null;
}

export interface UploadStatusResult {
  status: string;
  parts: { part_number: number; etag: string }[];
}

export const createUpload = (
  payload: { profileId: ProfileId; pitchId: string },
  token: string,
): Promise<CreateUploadResult> => request("POST", "/uploads", token, payload);

export const recordPart = (
  input: { key: string; partNumber: number; etag: string; complete?: boolean },
  token: string,
): Promise<RecordPartResult> => request("POST", "/uploads/part", token, input);

export const getUploadStatus = (key: string, token: string): Promise<UploadStatusResult> =>
  request("GET", `/uploads/${encodeURIComponent(key)}`, token);

export const abortUpload = (key: string, token: string): Promise<void> =>
  request("DELETE", `/uploads/${encodeURIComponent(key)}`, token);
