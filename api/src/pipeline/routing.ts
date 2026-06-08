import { PROFILES, type ProfileId } from "../profiles";

// The literal prefix a profile's keyTemplate writes under — everything before the
// first `{placeholder}` (e.g. "projects/" from "projects/{timestamp}-{uuid}.webm").
const prefixOf = (keyTemplate: string): string => {
  const brace = keyTemplate.indexOf("{");

  return brace === -1 ? keyTemplate : keyTemplate.slice(0, brace);
};

// Maps an object key back to the profile that produced it. Derived from the table
// so re-adding a profile needs only a table entry, never a routing edit.
export const profileForKey = (key: string): ProfileId | null => {
  for (const profile of Object.values(PROFILES)) {
    if (key.startsWith(prefixOf(profile.keyTemplate))) {
      return profile.id;
    }
  }

  return null;
};
