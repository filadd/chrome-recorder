import { describe, expect, it } from "vitest";

import { applyFieldChange, clearMeetingFields, reconcileMeetingFields } from "./meeting-fields";
import { DEFAULT_SETTINGS, type Settings } from "./storage";

const PITCH_A = "667c67371f6544719c3c50258bdbfe65";
const PITCH_B = "00f4456584754f8c82334d758e506025";

const withFields = (slug: string | null): Settings => ({
  ...DEFAULT_SETTINGS,
  meetingFields: { slug, values: { project: { pitchId: PITCH_A } } },
});

describe("reconcileMeetingFields", () => {
  it("keeps values typed for the same meeting", () => {
    const settings = withFields("abc-defg-hij");

    expect(reconcileMeetingFields(settings, "abc-defg-hij")).toBe(settings);
  });

  it("resets values when the active meeting changes", () => {
    const settings = reconcileMeetingFields(withFields("abc-defg-hij"), "zzz-zzzz-zzz");

    expect(settings.meetingFields).toEqual({ slug: "zzz-zzzz-zzz", values: {} });
  });

  it("resets values typed for a meeting when no meeting is active", () => {
    const settings = reconcileMeetingFields(withFields("abc-defg-hij"), null);

    expect(settings.meetingFields).toEqual({ slug: null, values: {} });
  });
});

describe("clearMeetingFields", () => {
  it("clears values but keeps the slug", () => {
    const settings = clearMeetingFields(withFields("abc-defg-hij"));

    expect(settings.meetingFields).toEqual({ slug: "abc-defg-hij", values: {} });
  });
});

describe("applyFieldChange", () => {
  it("stores the value under the profile", () => {
    const settings = applyFieldChange(DEFAULT_SETTINGS, "project", "pitchId", PITCH_A);

    expect(settings.meetingFields.values.project).toEqual({ pitchId: PITCH_A });
  });

  it("merges with previously typed values for the same profile", () => {
    const base = applyFieldChange(DEFAULT_SETTINGS, "project", "pitchId", PITCH_A);
    const settings = applyFieldChange(base, "project", "pitchId", PITCH_B);

    expect(settings.meetingFields.values.project).toEqual({ pitchId: PITCH_B });
  });
});
