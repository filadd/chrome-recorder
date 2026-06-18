// Thin proxy over file-uploads-api's multipart endpoints. The stand-in calls this
// service DIRECTLY (it has no app-level auth — it's gateway-fronted in prod). The
// service owns the parts ledger (Redis) and the S3 multipart session; the stand-in
// only forwards the upload configuration and relays presigned URLs to the client.

export interface MultipartConfig {
  destination: { bucket: string; path: string };
  allowed_mimetypes: string[];
  constraints: unknown[];
  transcoding: null;
  max_size: number | null;
  file_extension: string;
  content_type: string;
  metadata: Record<string, string>;
}

export interface MultipartCreate {
  key: string;
  filepath: string;
  partNumber: number;
  url: string;
}

export interface MultipartPart {
  key: string;
  status: string;
  partNumber: number | null;
  url: string | null;
}

export interface MultipartStatus {
  configuration: unknown;
  status: string;
  parts: { part_number: number; etag: string }[];
}

// Non-2xx from file-uploads carries a status the routes map back onto the client
// contract (4xx forwarded, anything else → 502).
export class UpstreamHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`file-uploads-api responded ${status}`);
    this.name = "UpstreamHttpError";
  }
}

export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamUnavailableError";
  }
}

const baseUrl = (): string => {
  const url = process.env.FILE_UPLOADS_API_URL;

  if (url == null || url === "") {
    throw new Error("FILE_UPLOADS_API_URL is not configured");
  }

  return url.replace(/\/$/, "");
};

const request = async (method: string, path: string, body?: unknown): Promise<Response> => {
  try {
    return await fetch(`${baseUrl()}${path}`, {
      method,
      headers: body != null ? { "Content-Type": "application/json" } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new UpstreamUnavailableError(`file-uploads-api unreachable: ${error}`);
  }
};

const parseJson = async (res: Response): Promise<unknown> => {
  if (!res.ok) {
    throw new UpstreamHttpError(res.status, await res.json().catch(() => null));
  }

  return res.json();
};

export const createMultipart = async (config: MultipartConfig): Promise<MultipartCreate> => {
  const body = (await parseJson(
    await request("POST", "/api/presigned-multipart-upload/", config),
  )) as { key: string; filepath: string; part_number: number; url: string };

  return { key: body.key, filepath: body.filepath, partNumber: body.part_number, url: body.url };
};

export const recordPart = async (input: {
  key: string;
  partNumber: number;
  etag: string;
  complete?: boolean;
}): Promise<MultipartPart> => {
  const body = (await parseJson(
    await request("POST", "/api/presigned-multipart-upload-part/", {
      key: input.key,
      part_number: input.partNumber,
      etag: input.etag,
      complete: input.complete ?? false,
    }),
  )) as { key: string; status: string; part_number: number | null; url: string | null };

  return { key: body.key, status: body.status, partNumber: body.part_number, url: body.url };
};

export const getMultipart = async (key: string): Promise<MultipartStatus> =>
  parseJson(
    await request("GET", `/api/presigned-multipart-upload/${encodeURIComponent(key)}/`),
  ) as Promise<MultipartStatus>;

export const abortMultipart = async (key: string): Promise<void> => {
  const res = await request("DELETE", `/api/presigned-multipart-upload/${encodeURIComponent(key)}/`);

  if (!res.ok) {
    throw new UpstreamHttpError(res.status, await res.json().catch(() => null));
  }
};
