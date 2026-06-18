import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { gatewayAuth } from "./auth";
import {
  abortMultipart,
  createMultipart,
  getMultipart,
  recordPart,
  UpstreamHttpError,
  UpstreamUnavailableError,
  type MultipartConfig,
} from "./file-uploads-client";
import { GatewayUnavailableError } from "./gateway-auth";
import { getProfile } from "./profiles";

// The stand-in mirrors n8n's Upload flow: validate the user via the gateway, then
// proxy the streaming multipart upload to file-uploads-api. It holds no AWS creds —
// file-uploads-api owns the S3 session, the parts ledger, and the object key.
export const app = new Hono<{ Variables: { email: string } }>();

app.use(logger());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
const corsForExtension = cors({ origin: allowedOrigins, allowHeaders: ["Authorization", "Content-Type"] });

app.use("/uploads", corsForExtension);
app.use("/uploads/*", corsForExtension);
app.use("/uploads", gatewayAuth);
app.use("/uploads/*", gatewayAuth);

const destination = () => ({
  bucket: process.env.DESTINATION_BUCKET ?? "",
  path: process.env.DESTINATION_PATH ?? "",
});

app.post("/uploads", async (c) => {
  const { profileId, pitchId } = (await c.req.json()) as { profileId?: string; pitchId?: string };
  const profile = getProfile(profileId ?? "");

  if (profile == null) {
    return c.json({ error: `Unknown profile: ${profileId}` }, 404);
  }

  const fields: Record<string, string | undefined> = { pitchId };
  const missing = profile.requiredFields.filter((key) => !fields[key]?.trim());

  if (missing.length > 0) {
    return c.json({ error: `Missing required fields: ${missing.join(", ")}` }, 400);
  }

  const malformed = Object.entries(profile.fieldPatterns).filter(
    ([key, pattern]) => fields[key] != null && !pattern.test(fields[key]!),
  );

  if (malformed.length > 0) {
    return c.json({ error: `Malformed fields: ${malformed.map(([key]) => key).join(", ")}` }, 400);
  }

  const config: MultipartConfig = {
    destination: destination(),
    allowed_mimetypes: profile.allowedMimetypes,
    constraints: [],
    transcoding: null,
    max_size: null,
    file_extension: profile.fileExtension,
    content_type: profile.contentType,
    metadata: { pitch_id: pitchId!, recorded_by: c.get("email") },
  };

  const result = await createMultipart(config);

  return c.json(result, 201);
});

app.post("/uploads/part", async (c) => {
  const { key, partNumber, etag, complete } = (await c.req.json()) as {
    key?: string;
    partNumber?: number;
    etag?: string;
    complete?: boolean;
  };

  if (typeof key !== "string" || typeof partNumber !== "number" || typeof etag !== "string") {
    return c.json({ error: "Invalid part" }, 400);
  }

  return c.json(await recordPart({ key, partNumber, etag, complete }));
});

app.get("/uploads/:key", async (c) => c.json(await getMultipart(c.req.param("key"))));

app.delete("/uploads/:key", async (c) => {
  await abortMultipart(c.req.param("key"));
  return c.body(null, 204);
});

// file-uploads 4xx (validation/conflict/not-found) is a meaningful client signal —
// forward it; an unreachable or 5xx upstream is a stand-in-side 502.
app.onError((error, c) => {
  if (error instanceof UpstreamHttpError) {
    return c.json(error.body ?? { error: "Upstream error" }, error.status >= 400 && error.status < 500 ? (error.status as 400) : 502);
  }

  if (error instanceof UpstreamUnavailableError || error instanceof GatewayUnavailableError) {
    return c.json({ error: String(error.message) }, 502);
  }

  return c.json({ error: String(error) }, 500);
});
