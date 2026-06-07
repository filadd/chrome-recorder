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
      fields: { project: { pitchId: "667c67371f6544719c3c50258bdbfe65" } },
    } as unknown as Partial<Settings>;

    const settings = normalizeSettings(legacy);

    expect(settings.meetingFields).toEqual({
      slug: null,
      values: { project: { pitchId: "667c67371f6544719c3c50258bdbfe65" } },
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

  it("drops profiles that no longer exist", () => {
    const settings = normalizeSettings({
      profileId: "private",
      enabledProfileIds: ["orientation", "private"],
    } as unknown as Partial<Settings>);

    expect(settings.enabledProfileIds).toEqual(["orientation"]);
    expect(settings.profileId).toBe("orientation");
  });

  it("falls the selected profile back to the first enabled one", () => {
    const settings = normalizeSettings({
      profileId: "project",
      enabledProfileIds: ["orientation"],
    });

    expect(settings.profileId).toBe("orientation");
  });

  it("keeps a selected profile that is still enabled", () => {
    const settings = normalizeSettings({
      profileId: "project",
      enabledProfileIds: ["orientation", "project"],
    });

    expect(settings.profileId).toBe("project");
  });

  it("defaults the pitch list and participants memory", () => {
    const settings = normalizeSettings({ userId: "x@filadd.com" });

    expect(settings.pitches).toEqual([]);
    expect(settings.participantsByPitch).toEqual({});
  });
});
