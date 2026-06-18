import { PROFILE_IDS, type ProfileId, type RecordingProfile } from "./types";

// The UI-facing profile table. The upload config (bucket, key, content type,
// metadata) is owned by api/src/profiles.ts — the server is the trust boundary.
export const PROFILES: Record<ProfileId, RecordingProfile> = {
  [PROFILE_IDS.project]: {
    id: PROFILE_IDS.project,
    labelKey: "profile_project_label",
    descriptionKey: "profile_project_desc",
    fields: [
      {
        key: "pitchId",
        labelKey: "field_pitch",
        placeholderKey: "field_pitch_ph",
        type: "select",
        required: true,
      },
    ],
  },
};

export const getProfile = (id: ProfileId): RecordingProfile => PROFILES[id];
