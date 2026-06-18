// Only `project` ships today; the table stays a map so other profiles can be
// re-added without touching the generic profile machinery.
export const PROFILE_IDS = {
  project: "project",
} as const;

export type ProfileId = (typeof PROFILE_IDS)[keyof typeof PROFILE_IDS];

export interface ProfileField {
  key: string;
  labelKey: string;
  placeholderKey: string;
  type: "text" | "select";
  required: boolean;
}

// The client only carries the UI shape and the user-provided fields now — the
// object key, destination bucket, content type, and metadata are all rendered
// server-side by the n8n stand-in / file-uploads-api (the trust boundary).
export interface RecordingProfile {
  id: ProfileId;
  labelKey: string;
  descriptionKey: string;
  fields: ProfileField[];
  requiresMeetTab?: boolean;
}
