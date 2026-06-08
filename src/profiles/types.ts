// Only `project` ships today; the table stays a map so other profiles can be
// re-added without touching the generic profile machinery.
export const PROFILE_IDS = {
  project: "project",
} as const;

export type ProfileId = (typeof PROFILE_IDS)[keyof typeof PROFILE_IDS];

// Logical bucket reference — the API maps it to a real bucket via env vars.
// The client never names a bucket directly.
export type BucketRef = ProfileId;

export const AUTO_FIELDS = {
  meetSlug: "meetSlug",
  timestamp: "timestamp",
  userId: "userId",
  uuid: "uuid",
} as const;

export type AutoField = (typeof AUTO_FIELDS)[keyof typeof AUTO_FIELDS];

export interface ProfileField {
  key: string;
  labelKey: string;
  placeholderKey: string;
  type: "text" | "select";
  required: boolean;
}

export interface RecordingProfile {
  id: ProfileId;
  labelKey: string;
  descriptionKey: string;
  bucket: BucketRef;
  keyTemplate: string;
  autoFields: AutoField[];
  fields: ProfileField[];
  attachAsObjectMetadata: boolean;
  contentType: "audio/webm";
  requiresMeetTab?: boolean;
}
