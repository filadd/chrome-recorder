import { describe, expect, it } from "vitest";
import { createActor } from "xstate";

import { STOP_REASON } from "../shared/messages";
import { UI_STATE } from "../shared/storage";
import { RECORDER_EVENT, recorderMachine } from "./machine";

const startEvent = {
  type: RECORDER_EVENT.start,
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
    expect(actor.getSnapshot().value).toBe(UI_STATE.arming);
    expect(actor.getSnapshot().context.slug).toBe("abc-defg-hij");

    actor.send({ type: RECORDER_EVENT.captureStarted });
    expect(actor.getSnapshot().value).toBe(UI_STATE.recording);

    actor.send({ type: RECORDER_EVENT.partUploaded, partNumber: 1 });
    expect(actor.getSnapshot().context.partsDone).toBe(1);

    actor.send({ type: RECORDER_EVENT.stop, reason: STOP_REASON.leave });
    expect(actor.getSnapshot().value).toBe(UI_STATE.stopping);

    actor.send({ type: RECORDER_EVENT.captureStopped });
    expect(actor.getSnapshot().value).toBe(UI_STATE.finalizing);

    actor.send({ type: RECORDER_EVENT.partUploaded, partNumber: 2 });
    actor.send({ type: RECORDER_EVENT.uploadFinished });
    expect(actor.getSnapshot().value).toBe(UI_STATE.finished);

    actor.send({ type: RECORDER_EVENT.reset });
    expect(actor.getSnapshot().value).toBe(UI_STATE.idle);
    expect(actor.getSnapshot().context.slug).toBe(null);
  });

  it("fails from any state and resets", () => {
    const actor = startedActor();
    actor.send({ type: RECORDER_EVENT.captureStarted });

    actor.send({ type: RECORDER_EVENT.fail, message: "boom" });
    expect(actor.getSnapshot().value).toBe(UI_STATE.error);
    expect(actor.getSnapshot().context.error).toBe("boom");

    actor.send({ type: RECORDER_EVENT.reset });
    expect(actor.getSnapshot().value).toBe(UI_STATE.idle);
    expect(actor.getSnapshot().context.error).toBe(null);
  });

  it("handles the mic permission detour", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: RECORDER_EVENT.needsPermission });
    expect(actor.getSnapshot().value).toBe(UI_STATE.needsPermission);

    actor.send({ type: RECORDER_EVENT.micGranted });
    expect(actor.getSnapshot().value).toBe(UI_STATE.idle);
  });

  it("mirrors mic mute while recording and resets it on a new start", () => {
    const actor = startedActor();
    actor.send({ type: RECORDER_EVENT.captureStarted });

    actor.send({ type: RECORDER_EVENT.micMuteChanged, muted: true });
    expect(actor.getSnapshot().context.micMuted).toBe(true);

    actor.send({ type: RECORDER_EVENT.stop, reason: STOP_REASON.user });
    actor.send({ type: RECORDER_EVENT.micMuteChanged, muted: false });
    expect(actor.getSnapshot().context.micMuted).toBe(false);

    actor.send({ type: RECORDER_EVENT.captureStopped });
    actor.send({ type: RECORDER_EVENT.uploadFinished });
    actor.send({ type: RECORDER_EVENT.reset });

    actor.send(startEvent);
    expect(actor.getSnapshot().context.micMuted).toBe(false);
  });

  it("ignores mute changes while idle", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: RECORDER_EVENT.micMuteChanged, muted: true });
    expect(actor.getSnapshot().context.micMuted).toBe(false);
  });

  it("resets out of needsPermission", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: RECORDER_EVENT.needsPermission });
    actor.send({ type: RECORDER_EVENT.reset });
    expect(actor.getSnapshot().value).toBe(UI_STATE.idle);
  });

  it("aborts arming when stopped early", () => {
    const actor = startedActor();

    actor.send({ type: RECORDER_EVENT.stop, reason: STOP_REASON.user });
    expect(actor.getSnapshot().value).toBe(UI_STATE.idle);
  });

  it("ignores stale capture events while idle", () => {
    const actor = createActor(recorderMachine).start();

    actor.send({ type: RECORDER_EVENT.captureStarted });
    actor.send({ type: RECORDER_EVENT.uploadFinished });
    expect(actor.getSnapshot().value).toBe(UI_STATE.idle);
  });

  it("rehydrates from a persisted snapshot", () => {
    const actor = startedActor();
    actor.send({ type: RECORDER_EVENT.captureStarted });

    const snapshot = actor.getPersistedSnapshot();
    const restored = createActor(recorderMachine, {
      snapshot: JSON.parse(JSON.stringify(snapshot)),
    }).start();

    expect(restored.getSnapshot().value).toBe(UI_STATE.recording);
    expect(restored.getSnapshot().context.slug).toBe("abc-defg-hij");
  });
});
