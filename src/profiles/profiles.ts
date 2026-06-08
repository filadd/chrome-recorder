import { PROFILE_IDS, type ProfileId, type RecordingProfile } from "./types";

// Mirrored in api/src/profiles.ts — the server owns its copy as the trust boundary.
export const PROFILES: Record<ProfileId, RecordingProfile> = {
  [PROFILE_IDS.project]: {
    id: PROFILE_IDS.project,
    labelKey: "profile_project_label",
    descriptionKey: "profile_project_desc",
    bucket: PROFILE_IDS.project,
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
