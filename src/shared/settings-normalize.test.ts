import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "./storage";

describe("normalizeSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("migrates legacy fields into meetingFields with a null slug", () => {
    const legacy = {
      profileId: "project",
      userId: "ana@filadd.com",
      enabledProfileIds: ["orientation", "project"],
      fields: { project: { projectId: "eng-101" } },
    } as unknown as Partial<Settings>;

    const settings = normalizeSettings(legacy);

    expect(settings.meetingFields).toEqual({
      slug: null,
      values: { project: { projectId: "eng-101" } },
    });
    expect("fields" in settings).toBe(false);
  });

  it("defaults enabledProfileIds to orientation when missing or empty", () => {
    expect(normalizeSettings({ userId: "x@filadd.com" }).enabledProfileIds).toEqual([
      "orientation",
    ]);
    expect(normalizeSettings({ enabledProfileIds: [] }).enabledProfileIds).toEqual([
      "orientation",
    ]);
  });

  it("falls the selected profile back to the first enabled one", () => {
    const settings = normalizeSettings({
      profileId: "project",
      enabledProfileIds: ["orientation", "private"],
    });

    expect(settings.profileId).toBe("orientation");
  });

  it("keeps a selected profile that is still enabled", () => {
    const settings = normalizeSettings({
      profileId: "private",
      enabledProfileIds: ["orientation", "private"],
    });

    expect(settings.profileId).toBe("private");
  });
});
