import { buildMixingGraph } from "../shared/audio";
import {
  AUDIO_BITS_PER_SECOND,
  RECORDER_TIMESLICE_MS,
  RECORDING_MIME_TYPE,
} from "../shared/constants";
import {
  MESSAGE_TARGET,
  sendMessage,
  SW_MESSAGE_TYPE,
  type PartTarget,
  type UploadSession,
} from "../shared/messages";
import { createPartBuffer } from "../upload/part-buffer";
import { createUploadManager } from "../upload/upload-manager";

interface ActiveRecording {
  stop: () => void;
  setMicMuted: (muted: boolean) => void;
}

let active: ActiveRecording | null = null;
let starting = false;
let stopRequested = false;

// `starting` covers the async setup window so a duplicate start can't slip in
// before `active` is assigned.
export const isRecording = (): boolean => starting || active != null;

export const startRecording = async (
  streamId: string,
  session: UploadSession,
  token: string,
  firstPart: PartTarget,
  attemptId: number,
): Promise<void> => {
  starting = true;
  stopRequested = false;

  try {
    await setUpRecording(streamId, session, token, firstPart, attemptId);
  } finally {
    starting = false;
  }
};

const setUpRecording = async (
  streamId: string,
  session: UploadSession,
  token: string,
  firstPart: PartTarget,
  attemptId: number,
): Promise<void> => {
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
    },
  } as MediaStreamConstraints);

  const stopTracks = (...streams: MediaStream[]) =>
    streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));

  let micStream: MediaStream;
  let mixed: Awaited<ReturnType<typeof buildMixingGraph>>;
  let recorder: MediaRecorder;

  // Any failure past tab capture must release every acquired stream, or Chrome
  // keeps showing the OS "recording" indicator with nothing actually recording.
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    stopTracks(tabStream);
    throw new Error(`Microphone capture failed: ${error}`);
  }

  try {
    mixed = await buildMixingGraph(tabStream, micStream);

    recorder = new MediaRecorder(mixed.stream, {
      mimeType: MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)
        ? RECORDING_MIME_TYPE
        : "audio/webm",
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
  } catch (error) {
    stopTracks(tabStream, micStream);
    throw error;
  }

  const buffer = createPartBuffer();
  const uploads = createUploadManager(session, token, firstPart, {
    onPartUploaded: (partNumber, etag) =>
      sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.partUploaded, partNumber, etag, attemptId }),
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      const part = buffer.append(event.data);

      if (part != null) {
        console.info(`[recorder] part ${part.partNumber} cut (${part.blob.size} bytes)`);
        uploads.enqueue(part);
      }
    }
  };

  const cleanup = () => {
    stopTracks(tabStream, micStream);
    mixed.context.close().catch(() => undefined);
    active = null;
  };

  recorder.onstop = async () => {
    // onstop fires after the final ondataavailable, so the buffer is complete —
    // release the streams (and the OS recording indicator) before the upload
    // finalization, which can take a while on a flaky network.
    cleanup();
    sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.captureStopped, attemptId });

    try {
      await uploads.finalize(buffer.flushFinal());
      sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.uploadFinished, attemptId });
    } catch (error) {
      console.error("[recorder] finalize failed:", error);
      sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.uploadFailed, message: String(error), attemptId });
    }
  };

  recorder.onerror = (event) => {
    console.error("[recorder] MediaRecorder error:", event);
    sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.captureError, message: "MediaRecorder error", attemptId });
    recorder.stop();
  };

  // The captured track ends when the tab closes or navigates — a DOM-independent
  // stop signal that complements the content script's leave detection.
  tabStream.getAudioTracks()[0]?.addEventListener("ended", () => {
    if (recorder.state === "recording") {
      recorder.stop();
    }
  });

  recorder.start(RECORDER_TIMESLICE_MS);

  active = {
    stop: () => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
    },

    // Mirrors Meet's own mute into the recording; the short ramp avoids clicks.
    setMicMuted: (muted) => {
      mixed.micGain.gain.setTargetAtTime(muted ? 0 : 1, mixed.context.currentTime, 0.02);
    },
  };

  // A stop that raced the async setup (user left the call immediately) must not
  // leave streams running.
  if (stopRequested) {
    active.stop();
    return;
  }

  sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.captureStarted, attemptId });
};

export const stopRecording = (): void => {
  stopRequested = true;
  active?.stop();
};

export const setMicMuted = (muted: boolean): void => {
  active?.setMicMuted(muted);
};
