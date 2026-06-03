// Server-side copy of the extension's profile table (src/profiles/profiles.ts).
// The API is the trust boundary: bucket and object key are always resolved here,
// never accepted from the client.

export type ProfileId = "orientation" | "private" | "project";
export type BucketRef = ProfileId;

export interface ServerProfile {
  id: ProfileId;
  bucket: BucketRef;
  keyTemplate: string;
  autoFields: string[];
  requiredFields: string[];
  optionalFields: string[];
  attachAsObjectMetadata: boolean;
  contentType: string;
}

export const PROFILES: Record<ProfileId, ServerProfile> = {
  orientation: {
    id: "orientation",
    bucket: "orientation",
    keyTemplate: "orientation/{meetSlug}/{timestamp}.webm",
    autoFields: ["meetSlug", "timestamp"],
    requiredFields: [],
    optionalFields: [],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },

  private: {
    id: "private",
    bucket: "private",
    keyTemplate: "private/{userId}/{date}/{timestamp}.webm",
    autoFields: ["userId", "date", "timestamp"],
    requiredFields: [],
    optionalFields: ["title"],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },

  project: {
    id: "project",
    bucket: "project",
    keyTemplate: "projects/{projectId}/{userId}/{timestamp}.webm",
    autoFields: ["userId", "timestamp"],
    requiredFields: ["projectId"],
    optionalFields: [],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },
};

export const getProfile = (id: string): ServerProfile | null =>
  (PROFILES as Record<string, ServerProfile>)[id] ?? null;
