import type { ProfileId } from "../profiles/types";
import type { UploadSession } from "./messages";

// The recording-lifecycle states, shared with the XState machine (its state node
// names are these values) and the UI snapshot.
export const UI_STATE = {
  idle: "idle",
  needsPermission: "needsPermission",
  arming: "arming",
  recording: "recording",
  stopping: "stopping",
  finalizing: "finalizing",
  finished: "finished",
  error: "error",
} as const;

export type UiState = (typeof UI_STATE)[keyof typeof UI_STATE];

export interface UiSnapshot {
  state: UiState;
  slug: string | null;
  profileId: ProfileId;
  startedAt: number | null;
  partsDone: number;
  micMuted: boolean;
  error: string | null;
}

export interface MeetingFields {
  // The Meet slug the values were typed for — values silently reset when the
  // active meeting changes, instead of leaking into unrelated recordings.
  slug: string | null;
  values: Partial<Record<ProfileId, Record<string, string>>>;
}

// A pitch the user registered in settings: `id` is the Notion page id parsed
// from the URL — it's what the recording carries as metadata.
export interface PitchEntry {
  id: string;
  label: string;
  url: string;
}

export interface Settings {
  profileId: ProfileId;
  userId: string;
  enabledProfileIds: ProfileId[];
  meetingFields: MeetingFields;
  pitches: PitchEntry[];
}

// The server owns the parts ledger now, so the client persists only enough to
// reconcile on restart: the session key + the last part it recorded (to finalize
// a still-PENDING session with complete:true on recovery).
export interface PendingUpload {
  session: UploadSession;
  lastPart: { partNumber: number; etag: string } | null;
  createdAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  profileId: "project",
  userId: "",
  enabledProfileIds: ["project"],
  meetingFields: { slug: null, values: {} },
  pitches: [],
};

const isKnownProfileId = (id: unknown): id is ProfileId => id === "project";

// Stored settings may predate enabledProfileIds / the meetingFields rename, or
// reference dropped profiles (`private`), so the shallow DEFAULT_SETTINGS
// spread isn't enough — normalize explicitly.
export const normalizeSettings = (stored: Partial<Settings> | undefined): Settings => {
  const legacyFields = (stored as { fields?: MeetingFields["values"] } | undefined)?.fields;
  const merged: Settings = { ...DEFAULT_SETTINGS, ...stored };

  if (legacyFields != null && (stored as Partial<Settings>)?.meetingFields == null) {
    merged.meetingFields = { slug: null, values: legacyFields };
  }

  delete (merged as Settings & { fields?: unknown }).fields;

  merged.enabledProfileIds = Array.isArray(merged.enabledProfileIds)
    ? merged.enabledProfileIds.filter(isKnownProfileId)
    : [];

  if (merged.enabledProfileIds.length === 0) {
    merged.enabledProfileIds = [...DEFAULT_SETTINGS.enabledProfileIds];
  }

  if (!merged.enabledProfileIds.includes(merged.profileId)) {
    merged.profileId = merged.enabledProfileIds[0];
  }

  if (!Array.isArray(merged.pitches)) {
    merged.pitches = [];
  }

  // Drop the dropped per-pitch participants memory if it lingers in stored settings.
  delete (merged as Settings & { participantsByPitch?: unknown }).participantsByPitch;

  return merged;
};

export const DEFAULT_SNAPSHOT: UiSnapshot = {
  state: UI_STATE.idle,
  slug: null,
  profileId: "project",
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

export const getSettings = async (): Promise<Settings> =>
  normalizeSettings(
    (await chrome.storage.local.get<{ settings?: Partial<Settings> }>("settings")).settings,
  );

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
