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
