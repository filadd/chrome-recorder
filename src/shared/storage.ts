import type { ProfileId } from "../profiles/types";
import type { UploadSession } from "./messages";

export type UiState =
  | "idle"
  | "needsPermission"
  | "arming"
  | "recording"
  | "stopping"
  | "finalizing"
  | "finished"
  | "error";

export interface UiSnapshot {
  state: UiState;
  slug: string | null;
  profileId: ProfileId;
  startedAt: number | null;
  partsDone: number;
  micMuted: boolean;
  error: string | null;
}

export interface Settings {
  profileId: ProfileId;
  userId: string;
  fields: Partial<Record<ProfileId, Record<string, string>>>;
}

export interface PendingUpload {
  session: UploadSession;
  parts: Record<number, string>;
  createdAt: number;
}

export const DEFAULT_SETTINGS: Settings = { profileId: "orientation", userId: "", fields: {} };

export const DEFAULT_SNAPSHOT: UiSnapshot = {
  state: "idle",
  slug: null,
  profileId: "orientation",
  startedAt: null,
  partsDone: 0,
  micMuted: false,
  error: null,
};

export const getSnapshot = async (): Promise<UiSnapshot> =>
  (await chrome.storage.local.get<{ snapshot?: UiSnapshot }>("snapshot")).snapshot ??
  DEFAULT_SNAPSHOT;

export const setSnapshot = (snapshot: UiSnapshot): Promise<void> =>
  chrome.storage.local.set({ snapshot });

export const onSnapshotChange = (listener: (snapshot: UiSnapshot) => void): void => {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.snapshot != null) {
      listener((changes.snapshot.newValue as UiSnapshot | undefined) ?? DEFAULT_SNAPSHOT);
    }
  });
};

export const getSettings = async (): Promise<Settings> => ({
  ...DEFAULT_SETTINGS,
  ...(await chrome.storage.local.get<{ settings?: Settings }>("settings")).settings,
});

export const setSettings = (settings: Settings): Promise<void> =>
  chrome.storage.local.set({ settings });

export const getMicGranted = async (): Promise<boolean> =>
  (await chrome.storage.local.get("micGranted")).micGranted === true;

export const setMicGranted = (micGranted: boolean): Promise<void> =>
  chrome.storage.local.set({ micGranted });

export const getPendingUpload = async (): Promise<PendingUpload | null> =>
  (await chrome.storage.local.get<{ pendingUpload?: PendingUpload }>("pendingUpload"))
    .pendingUpload ?? null;

export const setPendingUpload = (pendingUpload: PendingUpload): Promise<void> =>
  chrome.storage.local.set({ pendingUpload });

export const clearPendingUpload = (): Promise<void> =>
  chrome.storage.local.remove("pendingUpload");

export const getRecordingTabId = async (): Promise<number | null> =>
  (await chrome.storage.session.get<{ recordingTabId?: number }>("recordingTabId"))
    .recordingTabId ?? null;

export const setRecordingTabId = (recordingTabId: number | null): Promise<void> =>
  chrome.storage.session.set({ recordingTabId });
