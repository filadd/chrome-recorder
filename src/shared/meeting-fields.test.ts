import { describe, expect, it } from "vitest";

import { clearMeetingFields, reconcileMeetingFields } from "./meeting-fields";
import { DEFAULT_SETTINGS, type Settings } from "./storage";

const withFields = (slug: string | null): Settings => ({
  ...DEFAULT_SETTINGS,
  meetingFields: { slug, values: { project: { projectId: "eng-101" } } },
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
