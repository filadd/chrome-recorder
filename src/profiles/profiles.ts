import type { ProfileId, RecordingProfile } from "./types";

// Mirrored in api/src/profiles.ts — the server owns its copy as the trust boundary.
export const PROFILES: Record<ProfileId, RecordingProfile> = {
  orientation: {
    id: "orientation",
    labelKey: "profile_orientation_label",
    descriptionKey: "profile_orientation_desc",
    bucket: "orientation",
    keyTemplate: "orientation/{meetSlug}/{timestamp}.webm",
    autoFields: ["meetSlug", "timestamp"],
    fields: [],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
    requiresMeetTab: true,
  },

  private: {
    id: "private",
    labelKey: "profile_private_label",
    descriptionKey: "profile_private_desc",
    bucket: "private",
    keyTemplate: "private/{userId}/{date}/{timestamp}.webm",
    autoFields: ["userId", "date", "timestamp"],
    fields: [
      {
        key: "title",
        labelKey: "field_title",
        placeholderKey: "field_title_ph",
        type: "text",
        required: false,
      },
    ],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },

  project: {
    id: "project",
    labelKey: "profile_project_label",
    descriptionKey: "profile_project_desc",
    bucket: "project",
    keyTemplate: "projects/{projectId}/{userId}/{timestamp}.webm",
    autoFields: ["userId", "timestamp"],
    fields: [
      {
        key: "projectId",
        labelKey: "field_project",
        placeholderKey: "field_project_ph",
        type: "text",
        required: true,
      },
    ],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },
};

export const getProfile = (id: ProfileId): RecordingProfile => PROFILES[id];
