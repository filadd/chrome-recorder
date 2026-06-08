import { describe, expect, it } from "vitest";

import { applyProfileToggle } from "./profile-toggle";
import { DEFAULT_SETTINGS, type Settings } from "./storage";

const withEnabled = (enabledProfileIds: Settings["enabledProfileIds"]): Settings => ({
  ...DEFAULT_SETTINGS,
  enabledProfileIds,
});

describe("applyProfileToggle", () => {
  it("keeps an enabled profile enabled when toggled on again", () => {
    const settings = applyProfileToggle(withEnabled(["project"]), "project", true);

    expect(settings.enabledProfileIds).toEqual(["project"]);
    expect(settings.profileId).toBe("project");
  });

  it("refuses to disable the last enabled profile", () => {
    const settings = withEnabled(["project"]);

    expect(applyProfileToggle(settings, "project", false)).toBe(settings);
  });
});
