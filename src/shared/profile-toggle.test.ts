import { describe, expect, it } from "vitest";

import { applyProfileToggle } from "./profile-toggle";
import { DEFAULT_SETTINGS, type Settings } from "./storage";

const withEnabled = (enabledProfileIds: Settings["enabledProfileIds"]): Settings => ({
  ...DEFAULT_SETTINGS,
  enabledProfileIds,
});

describe("applyProfileToggle", () => {
  it("enables a profile keeping the profile-table order", () => {
    const settings = applyProfileToggle(withEnabled(["project"]), "orientation", true);

    expect(settings.enabledProfileIds).toEqual(["orientation", "project"]);
  });

  it("disables a non-selected profile without touching the selection", () => {
    const settings = applyProfileToggle(
      { ...withEnabled(["orientation", "private"]), profileId: "orientation" },
      "private",
      false,
    );

    expect(settings.enabledProfileIds).toEqual(["orientation"]);
    expect(settings.profileId).toBe("orientation");
  });

  it("falls the selection back when the selected profile is disabled", () => {
    const settings = applyProfileToggle(
      { ...withEnabled(["orientation", "project"]), profileId: "project" },
      "project",
      false,
    );

    expect(settings.profileId).toBe("orientation");
  });

  it("refuses to disable the last enabled profile", () => {
    const settings = withEnabled(["orientation"]);

    expect(applyProfileToggle(settings, "orientation", false)).toBe(settings);
  });
});
