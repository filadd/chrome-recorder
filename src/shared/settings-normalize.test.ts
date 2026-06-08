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
      enabledProfileIds: ["project"],
      fields: { project: { pitchId: "667c67371f6544719c3c50258bdbfe65" } },
    } as unknown as Partial<Settings>;

    const settings = normalizeSettings(legacy);

    expect(settings.meetingFields).toEqual({
      slug: null,
      values: { project: { pitchId: "667c67371f6544719c3c50258bdbfe65" } },
    });
    expect("fields" in settings).toBe(false);
  });

  it("defaults enabledProfileIds to project when missing or empty", () => {
    expect(normalizeSettings({ userId: "x@filadd.com" }).enabledProfileIds).toEqual(["project"]);
    expect(normalizeSettings({ enabledProfileIds: [] }).enabledProfileIds).toEqual(["project"]);
  });

  it("drops profiles that no longer exist", () => {
    const settings = normalizeSettings({
      profileId: "orientation",
      enabledProfileIds: ["orientation", "private"],
    } as unknown as Partial<Settings>);

    expect(settings.enabledProfileIds).toEqual(["project"]);
    expect(settings.profileId).toBe("project");
  });

  it("falls the selected profile back to the first enabled one", () => {
    const settings = normalizeSettings({
      profileId: "orientation",
      enabledProfileIds: ["project"],
    } as unknown as Partial<Settings>);

    expect(settings.profileId).toBe("project");
  });

  it("keeps a selected profile that is still enabled", () => {
    const settings = normalizeSettings({
      profileId: "project",
      enabledProfileIds: ["project"],
    });

    expect(settings.profileId).toBe("project");
  });

  it("defaults the pitch list", () => {
    const settings = normalizeSettings({ userId: "x@filadd.com" });

    expect(settings.pitches).toEqual([]);
  });

  it("drops a lingering participants memory from stored settings", () => {
    const settings = normalizeSettings({
      userId: "x@filadd.com",
      participantsByPitch: { abc: "Ana" },
    } as unknown as Partial<Settings>);

    expect("participantsByPitch" in settings).toBe(false);
  });
});
