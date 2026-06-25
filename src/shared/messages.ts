import type { ProfileId } from "../profiles/types";

// file-uploads-api owns the object key (and the internal S3 UploadId); the client
// only ever holds the public `key` and the presigned URL it needs next.
export interface UploadSession {
  key: string;
  filepath: string;
  profileId: ProfileId;
}

// One presigned UploadPart URL and the part number it is good for. The create call
// seeds the first; each recorded part hands back the next.
export interface PartTarget {
  partNumber: number;
  url: string;
}

// Const maps (with derived types) for every message discriminant, so producers and
// consumers reference a name instead of a bare string literal.
export const MESSAGE_TARGET = {
  sw: "sw",
  offscreen: "offscreen",
  content: "content",
} as const;

export type MessageTarget = (typeof MESSAGE_TARGET)[keyof typeof MESSAGE_TARGET];

export const STOP_REASON = {
  user: "user",
  leave: "leave",
  tabClosed: "tab-closed",
  trackEnded: "track-ended",
} as const;

export type StopReason = (typeof STOP_REASON)[keyof typeof STOP_REASON];

export const SW_MESSAGE_TYPE = {
  toggleRecording: "toggle-recording",
  openPopup: "open-popup",
  stopRecording: "stop-recording",
  micMuteChanged: "mic-mute-changed",
  micGranted: "mic-granted",
  closePermissionTab: "close-permission-tab",
  captureStarted: "capture-started",
  captureStopped: "capture-stopped",
  captureError: "capture-error",
  partUploaded: "part-uploaded",
  uploadFinished: "upload-finished",
  uploadFailed: "upload-failed",
  recoverRetry: "recover-retry",
  recoverAbort: "recover-abort",
  dismissError: "dismiss-error",
} as const;

export type SwMessageType = (typeof SW_MESSAGE_TYPE)[keyof typeof SW_MESSAGE_TYPE];

export const OFFSCREEN_MESSAGE_TYPE = {
  startCapture: "start-capture",
  stopCapture: "stop-capture",
  setMicMuted: "set-mic-muted",
  ping: "ping",
} as const;

export type OffscreenMessageType = (typeof OFFSCREEN_MESSAGE_TYPE)[keyof typeof OFFSCREEN_MESSAGE_TYPE];

export const CONTENT_MESSAGE_TYPE = {
  queryMicMute: "query-mic-mute",
} as const;

export type ContentMessageType = (typeof CONTENT_MESSAGE_TYPE)[keyof typeof CONTENT_MESSAGE_TYPE];

export type SwMessage =
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.toggleRecording }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.openPopup }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.stopRecording; reason: StopReason }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.micMuteChanged; muted: boolean }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.micGranted }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.closePermissionTab }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.captureStarted }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.captureStopped }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.captureError; message: string }
  // The offscreen document can't touch chrome.storage (offscreen docs only get
  // chrome.runtime), so the ETag travels here for the SW to persist.
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.partUploaded; partNumber: number; etag: string }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.uploadFinished }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.uploadFailed; message: string }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.recoverRetry }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.recoverAbort }
  | { target: typeof MESSAGE_TARGET.sw; type: typeof SW_MESSAGE_TYPE.dismissError };

export type OffscreenMessage =
  | {
      target: typeof MESSAGE_TARGET.offscreen;
      type: typeof OFFSCREEN_MESSAGE_TYPE.startCapture;
      streamId: string;
      session: UploadSession;
      // The offscreen doc can't read chrome.cookies, so the SW passes the bearer
      // token (the `auth._token.local` value) and the first presigned part here.
      token: string;
      firstPart: PartTarget;
    }
  | { target: typeof MESSAGE_TARGET.offscreen; type: typeof OFFSCREEN_MESSAGE_TYPE.stopCapture }
  | { target: typeof MESSAGE_TARGET.offscreen; type: typeof OFFSCREEN_MESSAGE_TYPE.setMicMuted; muted: boolean }
  | { target: typeof MESSAGE_TARGET.offscreen; type: typeof OFFSCREEN_MESSAGE_TYPE.ping };

// Delivered with chrome.tabs.sendMessage to the recording tab's content script.
export type ContentMessage = {
  target: typeof MESSAGE_TARGET.content;
  type: typeof CONTENT_MESSAGE_TYPE.queryMicMute;
};

export type Message = SwMessage | OffscreenMessage | ContentMessage;

export const sendMessage = (message: Message): Promise<unknown> =>
  chrome.runtime.sendMessage(message).catch(() => undefined);

export const isForTarget = <T extends Message["target"]>(
  message: unknown,
  target: T,
): message is Extract<Message, { target: T }> =>
  typeof message === "object" && message != null && (message as Message).target === target;
