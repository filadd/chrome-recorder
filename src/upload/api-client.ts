import type { ProfileId } from "../profiles/types";
import { API_BASE_URL, API_TOKEN } from "../shared/constants";
import type { UploadSession } from "../shared/messages";

export interface UploadPartRef {
  PartNumber: number;
  ETag: string;
}

const request = async <T>(method: string, path: string, body: unknown): Promise<T> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`API ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<T>;
};

export const createUpload = (payload: {
  profileId: ProfileId;
  auto: Record<string, string>;
  fields: Record<string, string>;
}): Promise<UploadSession> =>
  request("POST", "/uploads", payload).then((res) => ({
    ...(res as Omit<UploadSession, "profileId">),
    profileId: payload.profileId,
  }));

export const getPartUrl = async (session: UploadSession, partNumber: number): Promise<string> => {
  const { urls } = await request<{ urls: { partNumber: number; url: string }[] }>(
    "POST",
    "/uploads/parts",
    { ...sessionRef(session), partNumbers: [partNumber] },
  );

  return urls[0].url;
};

export const completeUpload = (
  session: UploadSession,
  parts: UploadPartRef[],
): Promise<{ key: string; location: string }> =>
  request("POST", "/uploads/complete", { ...sessionRef(session), parts });

export const abortUpload = (session: UploadSession): Promise<{ aborted: boolean }> =>
  request("DELETE", "/uploads", sessionRef(session));

export const listParts = (session: UploadSession): Promise<{ parts: UploadPartRef[] }> =>
  request("POST", "/uploads/list-parts", sessionRef(session));

const sessionRef = ({ bucketRef, key, uploadId }: UploadSession) => ({ bucketRef, key, uploadId });
