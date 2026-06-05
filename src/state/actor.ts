import { createActor, type Actor, type Snapshot } from "xstate";

import { setSnapshot, type UiSnapshot, type UiState } from "../shared/storage";
import { recorderMachine, type MachineEvent } from "./machine";

const MACHINE_SNAPSHOT_KEY = "machineSnapshot";

// MV3 service workers die after ~30s idle; the actor is rebuilt from its persisted
// snapshot on every wake-up, so a machine-shape change must not brick the extension —
// an unreadable snapshot falls back to a fresh idle actor.
export const restoreRecorderActor = async (): Promise<Actor<typeof recorderMachine>> => {
  const stored = (await chrome.storage.session.get(MACHINE_SNAPSHOT_KEY))[MACHINE_SNAPSHOT_KEY];

  const actor = (() => {
    try {
      return createActor(recorderMachine, stored != null ? { snapshot: stored as Snapshot<unknown> } : undefined);
    } catch {
      return createActor(recorderMachine);
    }
  })();

  actor.subscribe((state) => {
    chrome.storage.session.set({ [MACHINE_SNAPSHOT_KEY]: actor.getPersistedSnapshot() });
    setSnapshot(toUiSnapshot(state.value as UiState, state.context));
  });

  actor.start();

  return actor;
};

export const sendEvent = (actor: Actor<typeof recorderMachine>, event: MachineEvent): void =>
  actor.send(event);

const toUiSnapshot = (
  state: UiState,
  context: Omit<UiSnapshot, "state">,
): UiSnapshot => ({
  state,
  slug: context.slug,
  profileId: context.profileId,
  startedAt: context.startedAt,
  partsDone: context.partsDone,
  micMuted: context.micMuted,
  error: context.error,
});
