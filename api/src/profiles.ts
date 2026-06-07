// Server-side copy of the extension's profile table (src/profiles/profiles.ts).
// The API is the trust boundary: bucket, object key and metadata are always
// resolved here, never accepted from the client.

export type ProfileId = "orientation" | "project";
export type BucketRef = ProfileId;

export interface ServerProfile {
  id: ProfileId;
  bucket: BucketRef;
  keyTemplate: string;
  autoFields: string[];
  requiredFields: string[];
  optionalFields: string[];
  fieldPatterns: Record<string, RegExp>;
  attachAsObjectMetadata: boolean;
  contentType: string;
}

export const PROFILES: Record<ProfileId, ServerProfile> = {
  orientation: {
    id: "orientation",
    bucket: "orientation",
    keyTemplate: "orientation/{timestamp}-{sessionId}.webm",
    autoFields: ["meetSlug", "timestamp", "userId"],
    requiredFields: ["sessionId"],
    optionalFields: [],
    fieldPatterns: { sessionId: /^\d+$/ },
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },

  project: {
    id: "project",
    bucket: "project",
    keyTemplate: "projects/{timestamp}-{uuid}.webm",
    autoFields: ["meetSlug", "timestamp", "userId", "uuid"],
    requiredFields: ["pitchId", "participants"],
    optionalFields: [],
    // Notion page id: 32 hex chars (uuid with the dashes stripped client-side).
    fieldPatterns: { pitchId: /^[0-9a-f]{32}$/ },
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },
};

export const getProfile = (id: string): ServerProfile | null =>
  (PROFILES as Record<string, ServerProfile>)[id] ?? null;
