import type { ProfileId } from "../profiles/types";
import type { Settings } from "./storage";

// Field values belong to the meeting they were typed for — a different active
// slug means a different call, so the values reset silently.
export const reconcileMeetingFields = (settings: Settings, activeSlug: string | null): Settings =>
  settings.meetingFields.slug === activeSlug
    ? settings
    : { ...settings, meetingFields: { slug: activeSlug, values: {} } };

export const clearMeetingFields = (settings: Settings): Settings => ({
  ...settings,
  meetingFields: { ...settings.meetingFields, values: {} },
});

// Single entry point for popup field edits: besides storing the value, it keeps
// the per-pitch participants memory in sync — picking a pitch recalls who was in
// its last recording, and typing participants updates that memory.
export const applyFieldChange = (
  settings: Settings,
  profileId: ProfileId,
  key: string,
  value: string,
): Settings => {
  const current = settings.meetingFields.values[profileId] ?? {};
  const values = { ...current, [key]: value };
  let participantsByPitch = settings.participantsByPitch;

  if (profileId === "project" && key === "pitchId") {
    values.participants = settings.participantsByPitch[value] ?? values.participants ?? "";
  }

  if (profileId === "project" && key === "participants" && (current.pitchId ?? "") !== "") {
    participantsByPitch = { ...participantsByPitch, [current.pitchId]: value };
  }

  return {
    ...settings,
    participantsByPitch,
    meetingFields: {
      ...settings.meetingFields,
      values: { ...settings.meetingFields.values, [profileId]: values },
    },
  };
};
