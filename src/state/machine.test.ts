import { describe, expect, it } from "vitest";
import { createActor } from "xstate";

import { recorderMachine } from "./machine";

const startEvent = {
  type: "START",
  slug: "abc-defg-hij",
  profileId: "project",
  startedAt: 1000,
} as const;

const startedActor = () => {
  const actor = createActor(recorderMachine).start();
  actor.send(startEvent);

  return actor;
};

describe("recorderMachine", () => {
  it("walks the happy path to finished", () => {
    const actor = startedActor();
    expect(actor.getSnapshot().value).toBe("arming");
    expect(actor.getSnapshot().context.slug).toBe("abc-defg-hij");

    actor.send({ type: "CAPTURE_STARTED" });
    expect(actor.getSnapshot().value).toBe("recording");

    actor.send({ type: "PART_UPLOADED", partNumber: 1 });
    expect(actor.getSnapshot().context.partsDone).toBe(1);

    actor.send({ type: "STOP", reason: "leave" });
    expect(actor.getSnapshot().value).toBe("stopping");

    actor.send({ type: "CAPTURE_STOPPED" });
    expect(actor.getSnapshot().value).toBe("finalizing");

    actor.send({ type: "PART_UPLOADED", partNumber: 2 });
    actor.send({ type: "UPLOAD_FINISHED" });
    expect(actor.getSnapshot().value).toBe("finished");

    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.slug).toBe(null);
  });

  it("fails from any state and resets", () => {
    const actor = startedActor();
    actor.send({ type: "CAPTURE_STARTED" });

    actor.send({ type: "FAIL", message: "boom" });
    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.error).toBe("boom");

    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.error).toBe(null);
  });

  it("handles the mic permission detour", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: "NEEDS_PERMISSION" });
    expect(actor.getSnapshot().value).toBe("needsPermission");

    actor.send({ type: "MIC_GRANTED" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("mirrors mic mute while recording and resets it on a new start", () => {
    const actor = startedActor();
    actor.send({ type: "CAPTURE_STARTED" });

    actor.send({ type: "MIC_MUTE_CHANGED", muted: true });
    expect(actor.getSnapshot().context.micMuted).toBe(true);

    actor.send({ type: "STOP", reason: "user" });
    actor.send({ type: "MIC_MUTE_CHANGED", muted: false });
    expect(actor.getSnapshot().context.micMuted).toBe(false);

    actor.send({ type: "CAPTURE_STOPPED" });
    actor.send({ type: "UPLOAD_FINISHED" });
    actor.send({ type: "RESET" });

    actor.send(startEvent);
    expect(actor.getSnapshot().context.micMuted).toBe(false);
  });

  it("ignores mute changes while idle", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: "MIC_MUTE_CHANGED", muted: true });
    expect(actor.getSnapshot().context.micMuted).toBe(false);
  });

  it("resets out of needsPermission", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: "NEEDS_PERMISSION" });
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("aborts arming when stopped early", () => {
    const actor = startedActor();

    actor.send({ type: "STOP", reason: "user" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("ignores stale capture events while idle", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: "CAPTURE_STARTED" });
    actor.send({ type: "UPLOAD_FINISHED" });
    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("rehydrates from a persisted snapshot", () => {
    const actor = startedActor();
    actor.send({ type: "CAPTURE_STARTED" });

    const snapshot = actor.getPersistedSnapshot();
    const restored = createActor(recorderMachine, {
      snapshot: JSON.parse(JSON.stringify(snapshot)),
    }).start();

    expect(restored.getSnapshot().value).toBe("recording");
    expect(restored.getSnapshot().context.slug).toBe("abc-defg-hij");
  });
});
