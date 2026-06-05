import type { ProfileId, BucketRef } from "../profiles/types";

export interface UploadSession {
  uploadId: string;
  key: string;
  bucketRef: BucketRef;
  profileId: ProfileId;
}

export type StopReason = "user" | "leave" | "tab-closed" | "track-ended";

export type SwMessage =
  | { target: "sw"; type: "toggle-recording" }
  | { target: "sw"; type: "stop-recording"; reason: StopReason }
  | { target: "sw"; type: "mic-mute-changed"; muted: boolean }
  | { target: "sw"; type: "mic-granted" }
  | { target: "sw"; type: "capture-started" }
  | { target: "sw"; type: "capture-stopped" }
  | { target: "sw"; type: "capture-error"; message: string }
  // The offscreen document can't touch chrome.storage (offscreen docs only get
  // chrome.runtime), so the ETag travels here for the SW to persist.
  | { target: "sw"; type: "part-uploaded"; partNumber: number; etag: string }
  | { target: "sw"; type: "upload-finished" }
  | { target: "sw"; type: "upload-failed"; message: string }
  | { target: "sw"; type: "recover-retry" }
  | { target: "sw"; type: "recover-abort" }
  | { target: "sw"; type: "dismiss-error" };

export type OffscreenMessage =
  | { target: "offscreen"; type: "start-capture"; streamId: string; session: UploadSession }
  | { target: "offscreen"; type: "stop-capture" }
  | { target: "offscreen"; type: "set-mic-muted"; muted: boolean }
  | { target: "offscreen"; type: "ping" };

// Delivered with chrome.tabs.sendMessage to the recording tab's content script.
export type ContentMessage = { target: "content"; type: "query-mic-mute" };

export type Message = SwMessage | OffscreenMessage | ContentMessage;

export const sendMessage = (message: Message): Promise<unknown> =>
  chrome.runtime.sendMessage(message).catch(() => undefined);

export const isForTarget = <T extends Message["target"]>(
  message: unknown,
  target: T,
): message is Extract<Message, { target: T }> =>
  typeof message === "object" && message != null && (message as Message).target === target;
