import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { bearerAuth } from "./auth";
import { buildObjectMetadata, renderKey } from "./keys";
import { getProfile, PROFILES, type BucketRef } from "./profiles";
import { presignExpiresSeconds, resolveBucket, s3 } from "./s3";

export const app = new Hono();

app.use(logger());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

app.use(
  "/uploads/*",
  cors({ origin: allowedOrigins, allowHeaders: ["Authorization", "Content-Type"] }),
);
app.use("/uploads", cors({ origin: allowedOrigins, allowHeaders: ["Authorization", "Content-Type"] }));
app.use("/uploads/*", bearerAuth);
app.use("/uploads", bearerAuth);

const isBucketRef = (value: unknown): value is BucketRef =>
  typeof value === "string" && value in PROFILES;

interface SessionRef {
  bucketRef: BucketRef;
  key: string;
  uploadId: string;
}

const parseSessionRef = (body: Record<string, unknown>): SessionRef => {
  const { bucketRef, key, uploadId } = body;

  if (!isBucketRef(bucketRef) || typeof key !== "string" || typeof uploadId !== "string") {
    throw new Error("Invalid session reference");
  }

  return { bucketRef, key, uploadId };
};

app.post("/uploads", async (c) => {
  const body = await c.req.json();
  const profile = getProfile(body.profileId);

  if (profile == null) {
    return c.json({ error: `Unknown profile: ${body.profileId}` }, 404);
  }

  const auto: Record<string, string> = body.auto ?? {};
  const fields: Record<string, string> = body.fields ?? {};

  const missing = profile.requiredFields.filter((key) => !fields[key]?.trim());

  if (missing.length > 0) {
    return c.json({ error: `Missing required fields: ${missing.join(", ")}` }, 400);
  }

  const malformed = Object.entries(profile.fieldPatterns).filter(
    ([key, pattern]) => fields[key] != null && !pattern.test(fields[key]),
  );

  if (malformed.length > 0) {
    return c.json({ error: `Malformed fields: ${malformed.map(([key]) => key).join(", ")}` }, 400);
  }

  let key: string;

  try {
    key = renderKey(profile, auto, fields);
  } catch (error) {
    return c.json({ error: String(error) }, 400);
  }

  const result = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: resolveBucket(profile.bucket),
      Key: key,
      ContentType: profile.contentType,
      Metadata: buildObjectMetadata(profile, auto, fields),
    }),
  );

  return c.json({ uploadId: result.UploadId, key, bucketRef: profile.bucket }, 201);
});

app.post("/uploads/parts", async (c) => {
  const body = await c.req.json();
  const { bucketRef, key, uploadId } = parseSessionRef(body);
  const partNumbers: number[] = body.partNumbers ?? [];

  if (partNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 10_000)) {
    return c.json({ error: "Invalid part numbers" }, 400);
  }

  const bucket = resolveBucket(bucketRef);

  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        s3,
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: presignExpiresSeconds() },
      ),
    })),
  );

  return c.json({ urls });
});

app.post("/uploads/complete", async (c) => {
  const body = await c.req.json();
  const { bucketRef, key, uploadId } = parseSessionRef(body);
  const parts: { PartNumber: number; ETag: string }[] = body.parts ?? [];

  if (parts.length === 0) {
    return c.json({ error: "No parts to complete" }, 400);
  }

  const result = await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: resolveBucket(bucketRef),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber),
      },
    }),
  );

  return c.json({ key, location: result.Location ?? `s3://${resolveBucket(bucketRef)}/${key}` });
});

app.post("/uploads/list-parts", async (c) => {
  const { bucketRef, key, uploadId } = parseSessionRef(await c.req.json());
  const bucket = resolveBucket(bucketRef);

  const parts: { PartNumber: number; ETag: string }[] = [];
  let marker: string | undefined;

  do {
    const result = await s3.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
    );

    for (const part of result.Parts ?? []) {
      parts.push({ PartNumber: part.PartNumber!, ETag: part.ETag! });
    }

    marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
  } while (marker != null);

  return c.json({ parts });
});

app.delete("/uploads", async (c) => {
  const { bucketRef, key, uploadId } = parseSessionRef(await c.req.json());

  await s3.send(
    new AbortMultipartUploadCommand({
      Bucket: resolveBucket(bucketRef),
      Key: key,
      UploadId: uploadId,
    }),
  );

  return c.json({ aborted: true });
});

app.onError((error, c) => c.json({ error: String(error) }, 500));
