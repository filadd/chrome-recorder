import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, DEFAULT_SNAPSHOT, type Settings, type UiSnapshot } from "../shared/storage";
import { deriveView } from "./view-state";

const PITCH_ID = "667c67371f6544719c3c50258bdbfe65";

const snapshot = (state: UiSnapshot["state"]): UiSnapshot => ({ ...DEFAULT_SNAPSHOT, state });

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe("deriveView", () => {
  it("flags first run until there is a session", () => {
    expect(deriveView(snapshot("idle"), settings(), true, "abc", false).firstRun).toBe(true);
    expect(deriveView(snapshot("idle"), settings(), true, "abc", true).firstRun).toBe(false);
  });

  it("cannot start without a session", () => {
    expect(deriveView(snapshot("finished"), settings(), true, "abc", false).canStart).toBe(false);
    expect(deriveView(snapshot("idle"), settings(), false, "abc", false).canStart).toBe(false);
  });

  it("marks active recording states as busy", () => {
    for (const state of ["arming", "recording", "stopping", "finalizing"] as const) {
      expect(deriveView(snapshot(state), settings(), true, "abc", true).busy).toBe(true);
    }

    expect(deriveView(snapshot("idle"), settings(), true, "abc", true).busy).toBe(false);
  });

  it("offers a new recording after finished or error", () => {
    for (const state of ["finished", "error"] as const) {
      const view = deriveView(snapshot(state), settings(), true, "abc", true);

      expect(view.done).toBe(true);
      expect(view.ctaKind).toBe("newRecording");
      expect(view.canStart).toBe(true);
    }
  });

  it("prioritizes new recording over a missing mic grant", () => {
    expect(deriveView(snapshot("finished"), settings(), false, "abc", true).ctaKind).toBe(
      "newRecording",
    );
  });

  it("asks for the mic before checking the meet tab", () => {
    const view = deriveView(snapshot("idle"), settings(), false, null, true);

    expect(view.ctaKind).toBe("grantMic");
    expect(view.canStart).toBe(true);
  });

  it("does not require a meet tab for the project profile", () => {
    const project = deriveView(
      snapshot("idle"),
      settings({
        meetingFields: { slug: null, values: { project: { pitchId: PITCH_ID } } },
      }),
      true,
      null,
      true,
    );
    expect(project.notOnMeet).toBe(false);
    expect(project.ctaKind).toBe("start");
  });

  it("blocks the project start until the pitch is selected", () => {
    const partial = deriveView(
      snapshot("idle"),
      settings({
        meetingFields: { slug: "abc", values: { project: {} } },
      }),
      true,
      "abc",
      true,
    );
    expect(partial.ctaKind).toBe("start");
    expect(partial.canStart).toBe(false);

    const filled = deriveView(
      snapshot("idle"),
      settings({
        meetingFields: { slug: "abc", values: { project: { pitchId: PITCH_ID } } },
      }),
      true,
      "abc",
      true,
    );
    expect(filled.canStart).toBe(true);
  });
});
