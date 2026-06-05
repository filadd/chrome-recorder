import { PROFILE_IDS, type ProfileId } from "../profiles/types";
import type { Settings } from "./storage";

// Keep the stored order stable (profile-table order) regardless of the order
// the user toggled profiles in.
const PROFILE_ORDER = Object.values(PROFILE_IDS);

export const applyProfileToggle = (
  settings: Settings,
  profileId: ProfileId,
  enabled: boolean,
): Settings => {
  const enabledProfileIds = PROFILE_ORDER.filter((id) =>
    id === profileId ? enabled : settings.enabledProfileIds.includes(id),
  );

  if (enabledProfileIds.length === 0) {
    return settings;
  }

  return {
    ...settings,
    enabledProfileIds,
    profileId: enabledProfileIds.includes(settings.profileId)
      ? settings.profileId
      : enabledProfileIds[0],
  };
};
