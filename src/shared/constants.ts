export const MEET_SLUG_REGEX = /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:[?#/]|$)/i;

export const RECORDING_MIME_TYPE = "audio/webm;codecs=opus";
export const AUDIO_BITS_PER_SECOND = 64_000;
export const RECORDER_TIMESLICE_MS = 3_000;

// S3 multipart minimum is 5 MiB for every part except the last; parts are cut as
// soon as the buffer crosses this floor so the unflushed tail stays minimal.
export const PART_SIZE_BYTES = 5 * 1024 * 1024;

export const UPLOAD_MAX_ATTEMPTS = 6;
export const UPLOAD_BACKOFF_BASE_MS = 1_000;
export const UPLOAD_BACKOFF_CAP_MS = 30_000;

export const API_BASE_URL = "https://54rfszznmzgpyax7tu6j5parem0wjtbt.lambda-url.sa-east-1.on.aws";
export const API_TOKEN = "a2307c59a8176e08c6199288ccac9f28743b11763ae64161af632c44d1734e20";

export const LEAVE_DEBOUNCE_MS = 1_500;
export const FINISHED_RESET_MS = 8_000;
