import type { ProfileId, RecordingProfile } from "./types";

// Mirrored in api/src/profiles.ts — the server owns its copy as the trust boundary.
export const PROFILES: Record<ProfileId, RecordingProfile> = {
  orientation: {
    id: "orientation",
    labelKey: "profile_orientation_label",
    descriptionKey: "profile_orientation_desc",
    bucket: "orientation",
    keyTemplate: "orientation/{timestamp}-{sessionId}.webm",
    autoFields: ["meetSlug", "timestamp", "userId"],
    fields: [
      {
        key: "sessionId",
        labelKey: "field_session",
        placeholderKey: "field_session_ph",
        type: "select",
        required: true,
      },
    ],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
    requiresMeetTab: true,
  },

  project: {
    id: "project",
    labelKey: "profile_project_label",
    descriptionKey: "profile_project_desc",
    bucket: "project",
    keyTemplate: "projects/{timestamp}-{uuid}.webm",
    autoFields: ["meetSlug", "timestamp", "userId", "uuid"],
    fields: [
      {
        key: "pitchId",
        labelKey: "field_pitch",
        placeholderKey: "field_pitch_ph",
        type: "select",
        required: true,
      },
      {
        key: "participants",
        labelKey: "field_participants",
        placeholderKey: "field_participants_ph",
        type: "text",
        required: true,
      },
    ],
    attachAsObjectMetadata: true,
    contentType: "audio/webm",
  },
};

export const getProfile = (id: ProfileId): RecordingProfile => PROFILES[id];
