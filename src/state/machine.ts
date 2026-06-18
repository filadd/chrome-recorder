import { assign, setup } from "xstate";

import type { ProfileId } from "../profiles/types";
import type { StopReason } from "../shared/messages";
import { UI_STATE } from "../shared/storage";

export interface MachineContext {
  slug: string | null;
  profileId: ProfileId;
  startedAt: number | null;
  partsDone: number;
  micMuted: boolean;
  error: string | null;
}

// Recording-lifecycle events as a const map (derived type), so senders reference a
// name instead of a bare string. State node names come from UI_STATE.
export const RECORDER_EVENT = {
  start: "START",
  needsPermission: "NEEDS_PERMISSION",
  micGranted: "MIC_GRANTED",
  captureStarted: "CAPTURE_STARTED",
  stop: "STOP",
  captureStopped: "CAPTURE_STOPPED",
  micMuteChanged: "MIC_MUTE_CHANGED",
  partUploaded: "PART_UPLOADED",
  uploadFinished: "UPLOAD_FINISHED",
  fail: "FAIL",
  reset: "RESET",
} as const;

export type RecorderEventType = (typeof RECORDER_EVENT)[keyof typeof RECORDER_EVENT];

export type MachineEvent =
  | { type: typeof RECORDER_EVENT.start; slug: string | null; profileId: ProfileId; startedAt: number }
  | { type: typeof RECORDER_EVENT.needsPermission }
  | { type: typeof RECORDER_EVENT.micGranted }
  | { type: typeof RECORDER_EVENT.captureStarted }
  | { type: typeof RECORDER_EVENT.stop; reason: StopReason }
  | { type: typeof RECORDER_EVENT.captureStopped }
  | { type: typeof RECORDER_EVENT.micMuteChanged; muted: boolean }
  | { type: typeof RECORDER_EVENT.partUploaded; partNumber: number }
  | { type: typeof RECORDER_EVENT.uploadFinished }
  | { type: typeof RECORDER_EVENT.fail; message: string }
  | { type: typeof RECORDER_EVENT.reset };

const initialContext: MachineContext = {
  slug: null,
  profileId: "project",
  startedAt: null,
  partsDone: 0,
  micMuted: false,
  error: null,
};

export const recorderMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
  },
}).createMachine({
  id: "recorder",
  initial: UI_STATE.idle,
  context: initialContext,

  on: {
    [RECORDER_EVENT.fail]: {
      target: `.${UI_STATE.error}`,
      actions: assign({ error: ({ event }) => event.message }),
    },
  },

  states: {
    [UI_STATE.idle]: {
      on: {
        [RECORDER_EVENT.start]: {
          target: UI_STATE.arming,
          actions: assign({
            slug: ({ event }) => event.slug,
            profileId: ({ event }) => event.profileId,
            startedAt: ({ event }) => event.startedAt,
            partsDone: () => 0,
            micMuted: () => false,
            error: () => null,
          }),
        },
        [RECORDER_EVENT.needsPermission]: UI_STATE.needsPermission,
      },
    },

    [UI_STATE.needsPermission]: {
      on: { [RECORDER_EVENT.micGranted]: UI_STATE.idle, [RECORDER_EVENT.reset]: UI_STATE.idle },
    },

    [UI_STATE.arming]: {
      on: {
        [RECORDER_EVENT.captureStarted]: UI_STATE.recording,
        [RECORDER_EVENT.stop]: UI_STATE.idle,
      },
    },

    [UI_STATE.recording]: {
      on: {
        [RECORDER_EVENT.stop]: UI_STATE.stopping,
        [RECORDER_EVENT.micMuteChanged]: {
          actions: assign({ micMuted: ({ event }) => event.muted }),
        },
        [RECORDER_EVENT.partUploaded]: {
          actions: assign({ partsDone: ({ event }) => event.partNumber }),
        },
      },
    },

    [UI_STATE.stopping]: {
      on: {
        [RECORDER_EVENT.captureStopped]: UI_STATE.finalizing,
        [RECORDER_EVENT.micMuteChanged]: {
          actions: assign({ micMuted: ({ event }) => event.muted }),
        },
        [RECORDER_EVENT.partUploaded]: {
          actions: assign({ partsDone: ({ event }) => event.partNumber }),
        },
        [RECORDER_EVENT.uploadFinished]: UI_STATE.finished,
      },
    },

    [UI_STATE.finalizing]: {
      on: {
        [RECORDER_EVENT.partUploaded]: {
          actions: assign({ partsDone: ({ event }) => event.partNumber }),
        },
        [RECORDER_EVENT.uploadFinished]: UI_STATE.finished,
      },
    },

    [UI_STATE.finished]: {
      on: { [RECORDER_EVENT.reset]: { target: UI_STATE.idle, actions: assign(() => initialContext) } },
    },

    [UI_STATE.error]: {
      on: { [RECORDER_EVENT.reset]: { target: UI_STATE.idle, actions: assign(() => initialContext) } },
    },
  },
});
