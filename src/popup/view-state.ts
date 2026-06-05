import { getProfile } from "../profiles/profiles";
import type { Settings, UiSnapshot } from "../shared/storage";

export const CTA_KINDS = {
  start: "start",
  meetFirst: "meetFirst",
  grantMic: "grantMic",
  newRecording: "newRecording",
} as const;

export type CtaKind = (typeof CTA_KINDS)[keyof typeof CTA_KINDS];

export interface PopupView {
  firstRun: boolean;
  busy: boolean;
  done: boolean;
  notOnMeet: boolean;
  needsMic: boolean;
  ctaKind: CtaKind;
  canStart: boolean;
}

const BUSY_STATES: UiSnapshot["state"][] = ["arming", "recording", "stopping", "finalizing"];
const DONE_STATES: UiSnapshot["state"][] = ["finished", "error"];

export const deriveView = (
  snapshot: UiSnapshot,
  settings: Settings,
  micGranted: boolean,
  activeSlug: string | null,
): PopupView => {
  const profile = getProfile(settings.profileId);

  const busy = BUSY_STATES.includes(snapshot.state);
  const done = DONE_STATES.includes(snapshot.state);
  const firstRun = settings.userId.trim() === "";
  const notOnMeet = profile.requiresMeetTab === true && activeSlug == null;
  const needsMic = !micGranted;

  const fieldValues = settings.meetingFields.values[profile.id] ?? {};
  const requiredFilled = profile.fields.every(
    (field) => !field.required || (fieldValues[field.key] ?? "").trim() !== "",
  );

  const ctaKind: CtaKind = done
    ? CTA_KINDS.newRecording
    : needsMic
      ? CTA_KINDS.grantMic
      : notOnMeet
        ? CTA_KINDS.meetFirst
        : CTA_KINDS.start;

  const canStart =
    ctaKind === CTA_KINDS.newRecording ||
    ctaKind === CTA_KINDS.grantMic ||
    (ctaKind === CTA_KINDS.start && requiredFilled);

  return { firstRun, busy, done, notOnMeet, needsMic, ctaKind, canStart };
};
