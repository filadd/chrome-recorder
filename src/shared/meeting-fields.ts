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

// Single entry point for popup field edits: stores the value under the active
// meeting's profile bucket.
export const applyFieldChange = (
  settings: Settings,
  profileId: ProfileId,
  key: string,
  value: string,
): Settings => {
  const current = settings.meetingFields.values[profileId] ?? {};

  return {
    ...settings,
    meetingFields: {
      ...settings.meetingFields,
      values: { ...settings.meetingFields.values, [profileId]: { ...current, [key]: value } },
    },
  };
};
