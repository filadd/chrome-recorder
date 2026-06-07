import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, DEFAULT_SNAPSHOT, type Settings, type UiSnapshot } from "../shared/storage";
import { deriveView } from "./view-state";

const PITCH_ID = "667c67371f6544719c3c50258bdbfe65";

const snapshot = (state: UiSnapshot["state"]): UiSnapshot => ({ ...DEFAULT_SNAPSHOT, state });

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  userId: "ana@filadd.com",
  ...patch,
});

describe("deriveView", () => {
  it("flags first run when no identifier is set", () => {
    expect(deriveView(snapshot("idle"), settings({ userId: "" }), true, "abc").firstRun).toBe(true);
    expect(deriveView(snapshot("idle"), settings({ userId: "  " }), true, "abc").firstRun).toBe(
      true,
    );
    expect(deriveView(snapshot("idle"), settings(), true, "abc").firstRun).toBe(false);
  });

  it("marks active recording states as busy", () => {
    for (const state of ["arming", "recording", "stopping", "finalizing"] as const) {
      expect(deriveView(snapshot(state), settings(), true, "abc").busy).toBe(true);
    }

    expect(deriveView(snapshot("idle"), settings(), true, "abc").busy).toBe(false);
  });

  it("offers a new recording after finished or error", () => {
    for (const state of ["finished", "error"] as const) {
      const view = deriveView(snapshot(state), settings(), true, "abc");

      expect(view.done).toBe(true);
      expect(view.ctaKind).toBe("newRecording");
      expect(view.canStart).toBe(true);
    }
  });

  it("prioritizes new recording over a missing mic grant", () => {
    expect(deriveView(snapshot("finished"), settings(), false, "abc").ctaKind).toBe(
      "newRecording",
    );
  });

  it("asks for the mic before checking the meet tab", () => {
    const view = deriveView(snapshot("idle"), settings(), false, null);

    expect(view.ctaKind).toBe("grantMic");
    expect(view.canStart).toBe(true);
  });

  it("requires a meet tab only for profiles that need one", () => {
    const orientation = deriveView(snapshot("idle"), settings(), true, null);
    expect(orientation.notOnMeet).toBe(true);
    expect(orientation.ctaKind).toBe("meetFirst");
    expect(orientation.canStart).toBe(false);

    const project = deriveView(
      snapshot("idle"),
      settings({
        profileId: "project",
        enabledProfileIds: ["orientation", "project"],
        meetingFields: {
          slug: null,
          values: { project: { pitchId: PITCH_ID, participants: "Ana, Beto" } },
        },
      }),
      true,
      null,
    );
    expect(project.notOnMeet).toBe(false);
    expect(project.ctaKind).toBe("start");
  });

  it("blocks the orientation start until the session is set", () => {
    const empty = deriveView(snapshot("idle"), settings(), true, "abc");
    expect(empty.ctaKind).toBe("start");
    expect(empty.canStart).toBe(false);

    const filled = deriveView(
      snapshot("idle"),
      settings({
        meetingFields: { slug: "abc", values: { orientation: { sessionId: "12345" } } },
      }),
      true,
      "abc",
    );
    expect(filled.canStart).toBe(true);
  });

  it("blocks the project start until every required field is filled", () => {
    const base = {
      profileId: "project" as const,
      enabledProfileIds: ["orientation", "project"] as Settings["enabledProfileIds"],
    };

    const partial = deriveView(
      snapshot("idle"),
      settings({
        ...base,
        meetingFields: { slug: "abc", values: { project: { pitchId: PITCH_ID } } },
      }),
      true,
      "abc",
    );
    expect(partial.ctaKind).toBe("start");
    expect(partial.canStart).toBe(false);

    const filled = deriveView(
      snapshot("idle"),
      settings({
        ...base,
        meetingFields: {
          slug: "abc",
          values: { project: { pitchId: PITCH_ID, participants: "Ana, Beto" } },
        },
      }),
      true,
      "abc",
    );
    expect(filled.canStart).toBe(true);
  });
});
