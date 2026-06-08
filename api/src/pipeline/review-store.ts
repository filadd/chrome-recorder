// S3 persistence for review artifacts (the `reviews/` transient queue). The
// bucket stays the only state: a `reviews/*.json` object is a pending review,
// its deletion is the finalize terminus.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { sanitizeSegment } from "../keys";
import { parseReviewKey, reviewKey, type ReviewArtifact, type ReviewSummary } from "./review";
import { s3 } from "../s3";

export const putArtifact = async (bucket: string, artifact: ReviewArtifact): Promise<string> => {
  const key = reviewKey(artifact);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "application/json",
      Body: JSON.stringify(artifact),
    }),
  );

  return key;
};

export const getArtifact = async (bucket: string, key: string): Promise<ReviewArtifact> => {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await result.Body!.transformToString();

  return JSON.parse(body) as ReviewArtifact;
};

export const deleteArtifact = (bucket: string, key: string): Promise<unknown> =>
  s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

const listKeys = async (bucket: string, prefix: string): Promise<{ key: string; modified: Date }[]> => {
  const out: { key: string; modified: Date }[] = [];
  let token: string | undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );

    for (const object of result.Contents ?? []) {
      if (object.Key != null) {
        out.push({ key: object.Key, modified: object.LastModified ?? new Date(0) });
      }
    }

    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token != null);

  return out;
};

// Inbox listing: one ListObjectsV2 scoped to the user's prefix; rows come from the
// keys themselves (no per-object fetch). Newest first.
export const listReviews = async (bucket: string, recordedBy: string): Promise<ReviewSummary[]> => {
  const objects = await listKeys(bucket, `reviews/${sanitizeSegment(recordedBy)}/`);

  return objects
    .map((object) => parseReviewKey(object.key))
    .filter((summary): summary is ReviewSummary => summary != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

// Sweeper backstop: every review artifact older than the cutoff, across all users.
export const listStaleReviews = async (bucket: string, olderThan: Date): Promise<string[]> => {
  const objects = await listKeys(bucket, "reviews/");

  return objects.filter((object) => object.modified < olderThan).map((object) => object.key);
};
