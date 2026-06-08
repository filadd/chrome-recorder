// Server-side copy of the extension's profile table (src/profiles/profiles.ts).
// The API is the trust boundary: bucket, object key and metadata are always
// resolved here, never accepted from the client.

// Profile ids live in a const map so the type derives from the table — adding or
// removing a profile never means editing a hand-written union.
export const PROFILE_IDS = {
  project: "project",
} as const;

export type ProfileId = (typeof PROFILE_IDS)[keyof typeof PROFILE_IDS];
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
  [PROFILE_IDS.project]: {
    id: PROFILE_IDS.project,
    bucket: PROFILE_IDS.project,
    keyTemplate: "projects/{timestamp}-{uuid}.webm",
    autoFields: ["meetSlug", "timestamp", "userId", "uuid"],
    requiredFields: ["pitchId"],
    optionalFields: [],
    // Notion page id: 32 hex chars (uuid with the dashes stripped client-side).
    fieldPatterns: { pitchId: /^[0-9a-f]{32}$/ },
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },
};

export const getProfile = (id: string): ServerProfile | null =>
  (PROFILES as Record<string, ServerProfile>)[id] ?? null;
