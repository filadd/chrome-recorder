import type { Actor } from "xstate";

import { getProfile } from "../profiles/profiles";
import { getAuthToken } from "../shared/auth-token";
import { FINISHED_RESET_MS } from "../shared/constants";
import { extractMeetSlug } from "../shared/meet";
import {
  CONTENT_MESSAGE_TYPE,
  isForTarget,
  MESSAGE_TARGET,
  OFFSCREEN_MESSAGE_TYPE,
  STOP_REASON,
  SW_MESSAGE_TYPE,
  type StopReason,
} from "../shared/messages";
import {
  clearPendingUpload,
  getMicGranted,
  getPendingUpload,
  getRecordingTabId,
  getSettings,
  setMicGranted,
  setPendingUpload,
  setRecordingTabId,
  setSnapshot,
  DEFAULT_SNAPSHOT,
  UI_STATE,
} from "../shared/storage";
import { restoreRecorderActor } from "../state/actor";
import { RECORDER_EVENT, type recorderMachine } from "../state/machine";
import { createUpload } from "../upload/api-client";
import { closeOffscreenDocument, ensureOffscreenDocument } from "./offscreen-host";
import { abortPendingUpload, retryPendingUpload } from "./recovery";

type RecorderActor = Actor<typeof recorderMachine>;

// The outcome of a start/stop attempt, reported back to the popup.
export const START_RESULT_STATUS = {
  started: "started",
  stopped: "stopped",
  needsInvocation: "needs-invocation",
  needsMetadata: "needs-metadata",
  needsPermission: "needs-permission",
  needsAuth: "needs-auth",
  error: "error",
} as const;

export type StartResultStatus = (typeof START_RESULT_STATUS)[keyof typeof START_RESULT_STATUS];

export type StartResult = { status: StartResultStatus };

// Listeners must be registered synchronously on every SW wake-up; the actor promise
// is created eagerly and awaited inside handlers.
const actorPromise = restoreRecorderActor();

const STARTABLE_STATES = new Set<string>([
  UI_STATE.idle,
  UI_STATE.needsPermission,
  UI_STATE.finished,
  UI_STATE.error,
]);

// Bumped once per start attempt and echoed through every offscreen-doc message
// about that attempt. A late failure/report from an attempt the user has since
// abandoned (retried after fixing an error, double-clicked start, ...) must not
// clobber a newer attempt's state — every async continuation below checks it's
// still the current one before touching the actor.
let currentAttemptId = 0;

const startRecording = async (
  actor: RecorderActor,
  tab: chrome.tabs.Tab,
): Promise<StartResult> => {
  const attemptId = ++currentAttemptId;
  const isCurrentAttempt = () => attemptId === currentAttemptId;

  // Gesture-sensitive: must be called before any other await or the transient
  // user-gesture window closes. The popup click / keyboard shortcut that got us
  // here is also the activeTab invocation Chrome requires.
  let streamId: string;

  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (error) {
    console.warn("[recorder] getMediaStreamId rejected:", error);

    if (isCurrentAttempt()) {
      actor.send({ type: RECORDER_EVENT.fail, message: String(error) });
    }

    return { status: START_RESULT_STATUS.needsInvocation };
  }

  const settings = await getSettings();
  const profile = getProfile(settings.profileId);
  const slug = extractMeetSlug(tab.url);

  if (profile.requiresMeetTab && slug == null) {
    return { status: START_RESULT_STATUS.error };
  }

  const fields = settings.meetingFields.values[profile.id] ?? {};
  const missingRequired = profile.fields.some(
    (field) => field.required && !fields[field.key]?.trim(),
  );

  if (missingRequired) {
    return { status: START_RESULT_STATUS.needsMetadata };
  }

  if (!(await getMicGranted())) {
    if (isCurrentAttempt()) {
      actor.send({ type: RECORDER_EVENT.needsPermission });
    }

    chrome.tabs.create({ url: chrome.runtime.getURL("src/permission/permission.html") });
    return { status: START_RESULT_STATUS.needsPermission };
  }

  // The offscreen doc can't read chrome.cookies, so the SW resolves the Filadd
  // JWT here and passes it down with the session.
  const token = await getAuthToken();

  if (token == null) {
    if (isCurrentAttempt()) {
      actor.send({ type: RECORDER_EVENT.fail, message: "Not signed in to Filadd — open Filadd and log in." });
    }

    return { status: START_RESULT_STATUS.needsAuth };
  }

  try {
    const { key, filepath, partNumber, url } = await createUpload(
      { profileId: profile.id, pitchId: fields.pitchId },
      token,
    );

    const session = { key, filepath, profileId: profile.id };

    if (!isCurrentAttempt()) {
      return { status: START_RESULT_STATUS.error };
    }

    await setPendingUpload({ session, lastPart: null, createdAt: Date.now() });
    await ensureOffscreenDocument();
    await setRecordingTabId(tab.id ?? null);

    actor.send({ type: RECORDER_EVENT.start, slug, profileId: profile.id, startedAt: Date.now() });

    chrome.runtime
      .sendMessage({
        target: MESSAGE_TARGET.offscreen,
        type: OFFSCREEN_MESSAGE_TYPE.startCapture,
        streamId,
        session,
        token,
        firstPart: { partNumber, url },
        attemptId,
      })
      .catch((error) => {
        console.error("[recorder] failed to reach offscreen document:", error);

        if (isCurrentAttempt()) {
          actor.send({ type: RECORDER_EVENT.fail, message: String(error) });
        }
      });

    return { status: START_RESULT_STATUS.started };
  } catch (error) {
    console.error("[recorder] start failed:", error);

    if (isCurrentAttempt()) {
      actor.send({ type: RECORDER_EVENT.fail, message: String(error) });
    }

    return { status: START_RESULT_STATUS.error };
  }
};

// The Ctrl+Shift+S command routes here — the SW is the only context that can
// open the action popup programmatically.
const openPopup = (): Promise<void> =>
  chrome.action
    .openPopup()
    .catch((error) => console.warn("[recorder] openPopup failed:", error));

const stopRecording = (actor: RecorderActor, reason: StopReason): StartResult => {
  actor.send({ type: RECORDER_EVENT.stop, reason });
  chrome.runtime
    .sendMessage({ target: MESSAGE_TARGET.offscreen, type: OFFSCREEN_MESSAGE_TYPE.stopCapture })
    .catch(() => undefined);

  return { status: START_RESULT_STATUS.stopped };
};

const toggleRecording = async (
  actor: RecorderActor,
  tab: chrome.tabs.Tab,
): Promise<StartResult> => {
  const state = String(actor.getSnapshot().value);

  if (state === UI_STATE.recording || state === UI_STATE.arming) {
    return stopRecording(actor, STOP_REASON.user);
  }

  if (STARTABLE_STATES.has(state)) {
    if (state === UI_STATE.finished || state === UI_STATE.error) {
      actor.send({ type: RECORDER_EVENT.reset });
    }

    if (state === UI_STATE.needsPermission) {
      actor.send({ type: RECORDER_EVENT.micGranted });
    }

    return startRecording(actor, tab);
  }

  return { status: START_RESULT_STATUS.error };
};

const applyMicMute = (actor: RecorderActor, muted: boolean): void => {
  const state = String(actor.getSnapshot().value);

  if (state === UI_STATE.recording || state === UI_STATE.stopping) {
    actor.send({ type: RECORDER_EVENT.micMuteChanged, muted });
    chrome.runtime
      .sendMessage({ target: MESSAGE_TARGET.offscreen, type: OFFSCREEN_MESSAGE_TYPE.setMicMuted, muted })
      .catch(() => undefined);
  }
};

const finishSession = async (actor: RecorderActor): Promise<void> => {
  await setRecordingTabId(null);
  await closeOffscreenDocument();

  setTimeout(() => actor.send({ type: RECORDER_EVENT.reset }), FINISHED_RESET_MS);
};

// Reports from the offscreen doc about an attempt the user has since retried
// past must not resurrect it — see the `currentAttemptId` guard in startRecording.
const OFFSCREEN_REPORT_TYPES = new Set<string>([
  SW_MESSAGE_TYPE.captureStarted,
  SW_MESSAGE_TYPE.captureStopped,
  SW_MESSAGE_TYPE.captureError,
  SW_MESSAGE_TYPE.partUploaded,
  SW_MESSAGE_TYPE.uploadFinished,
  SW_MESSAGE_TYPE.uploadFailed,
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isForTarget(message, MESSAGE_TARGET.sw)) {
    return;
  }

  if (
    OFFSCREEN_REPORT_TYPES.has(message.type) &&
    "attemptId" in message &&
    message.attemptId !== currentAttemptId
  ) {
    console.warn("[recorder] ignoring stale offscreen report:", message.type, message.attemptId);
    return;
  }

  const handle = async (): Promise<unknown> => {
    const actor = await actorPromise;

    switch (message.type) {
      case SW_MESSAGE_TYPE.toggleRecording: {
        const tab =
          sender.tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

        return tab == null ? { status: START_RESULT_STATUS.error } : toggleRecording(actor, tab);
      }

      case SW_MESSAGE_TYPE.stopRecording:
        return stopRecording(actor, message.reason);

      case SW_MESSAGE_TYPE.micGranted:
        await setMicGranted(true);
        actor.send({ type: RECORDER_EVENT.micGranted });
        return undefined;

      case SW_MESSAGE_TYPE.closePermissionTab:
        if (sender.tab?.id != null) {
          await chrome.tabs.remove(sender.tab.id);
        }
        return undefined;

      case SW_MESSAGE_TYPE.micMuteChanged:
        applyMicMute(actor, message.muted);
        return undefined;

      case SW_MESSAGE_TYPE.captureStarted: {
        actor.send({ type: RECORDER_EVENT.captureStarted });

        // The user may have been muted in Meet before the recording started;
        // mute changes are only pushed on transitions, so sync the initial state.
        const tabId = await getRecordingTabId();

        if (tabId != null) {
          chrome.tabs
            .sendMessage(tabId, { target: MESSAGE_TARGET.content, type: CONTENT_MESSAGE_TYPE.queryMicMute })
            .then((response) => {
              const muted = (response as { muted: boolean | null } | undefined)?.muted;

              if (muted != null) {
                applyMicMute(actor, muted);
              }
            })
            .catch(() => undefined);
        }

        return undefined;
      }

      case SW_MESSAGE_TYPE.captureStopped:
        actor.send({ type: RECORDER_EVENT.captureStopped });
        return undefined;

      case SW_MESSAGE_TYPE.partUploaded: {
        actor.send({ type: RECORDER_EVENT.partUploaded, partNumber: message.partNumber });

        const pending = await getPendingUpload();

        if (pending != null) {
          pending.lastPart = { partNumber: message.partNumber, etag: message.etag };
          await setPendingUpload(pending);
        }

        return undefined;
      }

      case SW_MESSAGE_TYPE.uploadFinished:
        actor.send({ type: RECORDER_EVENT.uploadFinished });
        await clearPendingUpload();
        await finishSession(actor);
        return undefined;

      case SW_MESSAGE_TYPE.uploadFailed:
        console.error("[recorder] upload failed:", message.message);
        actor.send({ type: RECORDER_EVENT.fail, message: message.message });
        await setRecordingTabId(null);
        await closeOffscreenDocument();
        return undefined;

      case SW_MESSAGE_TYPE.captureError:
        console.error("[recorder] capture error:", message.message);
        actor.send({ type: RECORDER_EVENT.fail, message: message.message });
        await setRecordingTabId(null);
        await closeOffscreenDocument();
        return undefined;

      case SW_MESSAGE_TYPE.recoverRetry:
        try {
          return { recovered: await retryPendingUpload() };
        } catch (error) {
          return { recovered: false, error: String(error) };
        }

      case SW_MESSAGE_TYPE.recoverAbort:
        await abortPendingUpload();
        return undefined;

      case SW_MESSAGE_TYPE.dismissError:
        actor.send({ type: RECORDER_EVENT.reset });
        return undefined;
    }
  };

  handle().then(sendResponse);

  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-popup") {
    openPopup();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === (await getRecordingTabId())) {
    stopRecording(await actorPromise, STOP_REASON.tabClosed);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url == null || tabId !== (await getRecordingTabId())) {
    return;
  }

  const actor = await actorPromise;
  const { slug } = actor.getSnapshot().context;

  if (extractMeetSlug(changeInfo.url) !== slug) {
    stopRecording(actor, STOP_REASON.tabClosed);
  }
});

// storage.session is gone after a browser restart, so the machine rehydrates fresh;
// the UI snapshot in storage.local must be reset to match. A pending upload ledger
// in storage.local survives and is surfaced by the popup for recovery.
chrome.runtime.onStartup.addListener(() => {
  setSnapshot(DEFAULT_SNAPSHOT);
});

chrome.runtime.onInstalled.addListener(() => {
  setSnapshot(DEFAULT_SNAPSHOT);
});
