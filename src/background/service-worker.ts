import type { Actor } from "xstate";

import { getProfile } from "../profiles/profiles";
import { FINISHED_RESET_MS } from "../shared/constants";
import { extractMeetSlug } from "../shared/meet";
import { isForTarget, type StopReason } from "../shared/messages";
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
} from "../shared/storage";
import { restoreRecorderActor } from "../state/actor";
import type { recorderMachine } from "../state/machine";
import { createUpload } from "../upload/api-client";
import { resolveAutoFields } from "./auto-fields";
import { closeOffscreenDocument, ensureOffscreenDocument } from "./offscreen-host";
import { abortPendingUpload, retryPendingUpload } from "./recovery";

type RecorderActor = Actor<typeof recorderMachine>;

// Listeners must be registered synchronously on every SW wake-up; the actor promise
// is created eagerly and awaited inside handlers.
const actorPromise = restoreRecorderActor();

export type StartResult =
  | { status: "started" | "stopped" }
  | { status: "needs-invocation" | "needs-metadata" | "needs-permission" | "error" };

const STARTABLE_STATES = new Set(["idle", "needsPermission", "finished", "error"]);

const startRecording = async (
  actor: RecorderActor,
  tab: chrome.tabs.Tab,
): Promise<StartResult> => {
  // Gesture-sensitive: must be called before any other await or the transient
  // user-gesture window closes. The popup click / keyboard shortcut that got us
  // here is also the activeTab invocation Chrome requires.
  let streamId: string;

  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (error) {
    console.warn("[recorder] getMediaStreamId rejected:", error);
    actor.send({ type: "FAIL", message: String(error) });
    return { status: "needs-invocation" };
  }

  const settings = await getSettings();
  const profile = getProfile(settings.profileId);
  const slug = extractMeetSlug(tab.url);

  if (profile.requiresMeetTab && slug == null) {
    return { status: "error" };
  }

  const fields = settings.fields[profile.id] ?? {};
  const missingRequired = profile.fields.some(
    (field) => field.required && !fields[field.key]?.trim(),
  );

  if (missingRequired) {
    return { status: "needs-metadata" };
  }

  if (!(await getMicGranted())) {
    actor.send({ type: "NEEDS_PERMISSION" });
    chrome.tabs.create({ url: chrome.runtime.getURL("src/permission/permission.html") });
    return { status: "needs-permission" };
  }

  try {
    const session = await createUpload({
      profileId: profile.id,
      auto: resolveAutoFields(profile.autoFields, { meetSlug: slug, userId: settings.userId }),
      fields,
    });

    await setPendingUpload({ session, parts: {}, createdAt: Date.now() });
    await ensureOffscreenDocument();
    await setRecordingTabId(tab.id ?? null);

    actor.send({ type: "START", slug, profileId: profile.id, startedAt: Date.now() });

    chrome.runtime
      .sendMessage({ target: "offscreen", type: "start-capture", streamId, session })
      .catch((error) => {
        console.error("[recorder] failed to reach offscreen document:", error);
        actor.send({ type: "FAIL", message: String(error) });
      });

    return { status: "started" };
  } catch (error) {
    console.error("[recorder] start failed:", error);
    actor.send({ type: "FAIL", message: String(error) });
    return { status: "error" };
  }
};

const stopRecording = (actor: RecorderActor, reason: StopReason): StartResult => {
  actor.send({ type: "STOP", reason });
  chrome.runtime.sendMessage({ target: "offscreen", type: "stop-capture" }).catch(() => undefined);

  return { status: "stopped" };
};

const toggleRecording = async (
  actor: RecorderActor,
  tab: chrome.tabs.Tab,
): Promise<StartResult> => {
  const state = String(actor.getSnapshot().value);

  if (state === "recording" || state === "arming") {
    return stopRecording(actor, "user");
  }

  if (STARTABLE_STATES.has(state)) {
    if (state === "finished" || state === "error") {
      actor.send({ type: "RESET" });
    }

    if (state === "needsPermission") {
      actor.send({ type: "MIC_GRANTED" });
    }

    return startRecording(actor, tab);
  }

  return { status: "error" };
};

const applyMicMute = (actor: RecorderActor, muted: boolean): void => {
  const state = String(actor.getSnapshot().value);

  if (state === "recording" || state === "stopping") {
    actor.send({ type: "MIC_MUTE_CHANGED", muted });
    chrome.runtime
      .sendMessage({ target: "offscreen", type: "set-mic-muted", muted })
      .catch(() => undefined);
  }
};

const finishSession = async (actor: RecorderActor): Promise<void> => {
  await setRecordingTabId(null);
  await closeOffscreenDocument();

  setTimeout(() => actor.send({ type: "RESET" }), FINISHED_RESET_MS);
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isForTarget(message, "sw")) {
    return;
  }

  const handle = async (): Promise<unknown> => {
    const actor = await actorPromise;

    switch (message.type) {
      case "toggle-recording": {
        const tab =
          sender.tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

        return tab == null ? { status: "error" } : toggleRecording(actor, tab);
      }

      case "stop-recording":
        return stopRecording(actor, message.reason);

      case "mic-granted":
        await setMicGranted(true);
        actor.send({ type: "MIC_GRANTED" });
        return undefined;

      case "mic-mute-changed":
        applyMicMute(actor, message.muted);
        return undefined;

      case "capture-started": {
        actor.send({ type: "CAPTURE_STARTED" });

        // The user may have been muted in Meet before the recording started;
        // mute changes are only pushed on transitions, so sync the initial state.
        const tabId = await getRecordingTabId();

        if (tabId != null) {
          chrome.tabs
            .sendMessage(tabId, { target: "content", type: "query-mic-mute" })
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

      case "capture-stopped":
        actor.send({ type: "CAPTURE_STOPPED" });
        return undefined;

      case "part-uploaded": {
        actor.send({ type: "PART_UPLOADED", partNumber: message.partNumber });

        const pending = await getPendingUpload();

        if (pending != null) {
          pending.parts[message.partNumber] = message.etag;
          await setPendingUpload(pending);
        }

        return undefined;
      }

      case "upload-finished":
        actor.send({ type: "UPLOAD_FINISHED" });
        await clearPendingUpload();
        await finishSession(actor);
        return undefined;

      case "upload-failed":
        console.error("[recorder] upload failed:", message.message);
        actor.send({ type: "FAIL", message: message.message });
        await setRecordingTabId(null);
        await closeOffscreenDocument();
        return undefined;

      case "capture-error":
        console.error("[recorder] capture error:", message.message);
        actor.send({ type: "FAIL", message: message.message });
        await setRecordingTabId(null);
        await closeOffscreenDocument();
        return undefined;

      case "recover-retry":
        try {
          return { recovered: await retryPendingUpload() };
        } catch (error) {
          return { recovered: false, error: String(error) };
        }

      case "recover-abort":
        await abortPendingUpload();
        return undefined;

      case "dismiss-error":
        actor.send({ type: "RESET" });
        return undefined;
    }
  };

  handle().then(sendResponse);

  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === (await getRecordingTabId())) {
    stopRecording(await actorPromise, "tab-closed");
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url == null || tabId !== (await getRecordingTabId())) {
    return;
  }

  const actor = await actorPromise;
  const { slug } = actor.getSnapshot().context;

  if (extractMeetSlug(changeInfo.url) !== slug) {
    stopRecording(actor, "tab-closed");
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
