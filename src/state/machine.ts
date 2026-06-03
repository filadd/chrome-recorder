import { assign, setup } from "xstate";

import type { ProfileId } from "../profiles/types";
import type { StopReason } from "../shared/messages";

export interface MachineContext {
  slug: string | null;
  profileId: ProfileId;
  startedAt: number | null;
  partsDone: number;
  error: string | null;
}

export type MachineEvent =
  | { type: "START"; slug: string | null; profileId: ProfileId; startedAt: number }
  | { type: "NEEDS_PERMISSION" }
  | { type: "MIC_GRANTED" }
  | { type: "CAPTURE_STARTED" }
  | { type: "STOP"; reason: StopReason }
  | { type: "CAPTURE_STOPPED" }
  | { type: "PART_UPLOADED"; partNumber: number }
  | { type: "UPLOAD_FINISHED" }
  | { type: "FAIL"; message: string }
  | { type: "RESET" };

const initialContext: MachineContext = {
  slug: null,
  profileId: "orientation",
  startedAt: null,
  partsDone: 0,
  error: null,
};

export const recorderMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as MachineEvent,
  },
}).createMachine({
  id: "recorder",
  initial: "idle",
  context: initialContext,

  on: {
    FAIL: {
      target: ".error",
      actions: assign({ error: ({ event }) => event.message }),
    },
  },

  states: {
    idle: {
      on: {
        START: {
          target: "arming",
          actions: assign({
            slug: ({ event }) => event.slug,
            profileId: ({ event }) => event.profileId,
            startedAt: ({ event }) => event.startedAt,
            partsDone: () => 0,
            error: () => null,
          }),
        },
        NEEDS_PERMISSION: "needsPermission",
      },
    },

    needsPermission: {
      on: { MIC_GRANTED: "idle", RESET: "idle" },
    },

    arming: {
      on: {
        CAPTURE_STARTED: "recording",
        STOP: "idle",
      },
    },

    recording: {
      on: {
        STOP: "stopping",
        PART_UPLOADED: {
          actions: assign({ partsDone: ({ event }) => event.partNumber }),
        },
      },
    },

    stopping: {
      on: {
        CAPTURE_STOPPED: "finalizing",
        PART_UPLOADED: {
          actions: assign({ partsDone: ({ event }) => event.partNumber }),
        },
        UPLOAD_FINISHED: "finished",
      },
    },

    finalizing: {
      on: {
        PART_UPLOADED: {
          actions: assign({ partsDone: ({ event }) => event.partNumber }),
        },
        UPLOAD_FINISHED: "finished",
      },
    },

    finished: {
      on: { RESET: { target: "idle", actions: assign(() => initialContext) } },
    },

    error: {
      on: { RESET: { target: "idle", actions: assign(() => initialContext) } },
    },
  },
});
