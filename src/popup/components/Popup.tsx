import { useEffect, useRef, useState } from "react";

import { getProfile } from "../../profiles/profiles";
import { useMicGranted } from "../../shared/hooks/useMicGranted";
import { usePendingUpload } from "../../shared/hooks/usePendingUpload";
import { useSettings } from "../../shared/hooks/useSettings";
import { useSnapshot } from "../../shared/hooks/useSnapshot";
import {
  applyFieldChange,
  clearMeetingFields,
  reconcileMeetingFields,
} from "../../shared/meeting-fields";
import { MESSAGE_TARGET, sendMessage, SW_MESSAGE_TYPE } from "../../shared/messages";
import { useActiveMeetTab } from "../hooks/useActiveMeetTab";
import { openPermissionPage } from "../open-permission-page";
import { deriveView } from "../view-state";
import { ContextualNotice } from "./ContextualNotice";
import { CtaBar } from "./CtaBar";
import { Header } from "./Header";
import { OnboardingOverlay } from "./OnboardingOverlay";
import { ProfileFieldsForm } from "./ProfileFieldsForm";
import { ProfileTabs } from "./ProfileTabs";
import { RecordingCard } from "./RecordingCard";
import { RecoveryBanner } from "./RecoveryBanner";
import { SettingsOverlay } from "./SettingsOverlay";
import { StatusCard } from "./StatusCard";

type Overlay = "none" | "onboarding" | "settings";

export const Popup = () => {
  const [snapshot, snapshotLoaded] = useSnapshot();
  const { settings, loaded: settingsLoaded, update } = useSettings();
  const [micGranted, micLoaded] = useMicGranted();
  const [pending, pendingLoaded] = usePendingUpload();
  const { slug, loaded: tabLoaded } = useActiveMeetTab();

  const loaded = snapshotLoaded && settingsLoaded && micLoaded && pendingLoaded && tabLoaded;

  const [overlay, setOverlay] = useState<Overlay>("none");
  const [starting, setStarting] = useState(false);
  const view = deriveView(snapshot, settings, micGranted, slug);

  // The SW round-trip (toggle → arming snapshot) takes a beat; show an
  // optimistic loading state on the start button until the snapshot moves
  // off idle, with a fallback so a failed start doesn't strand the spinner.
  useEffect(() => {
    if (!starting) {
      return;
    }

    if (snapshot.state !== "idle") {
      setStarting(false);
      return;
    }

    const timer = setTimeout(() => setStarting(false), 5000);
    return () => clearTimeout(timer);
  }, [starting, snapshot.state]);

  // Field values belong to the meeting they were typed for — reconcile once
  // per popup open, as soon as the active tab's slug is known.
  const reconciled = useRef(false);
  useEffect(() => {
    if (!loaded || reconciled.current) {
      return;
    }

    reconciled.current = true;
    const next = reconcileMeetingFields(settings, slug);

    if (next !== settings) {
      update(next);
    }
  }, [loaded]);

  useEffect(() => {
    if (loaded && view.firstRun) {
      setOverlay("onboarding");
    }
  }, [loaded, view.firstRun]);

  if (!loaded) {
    return null;
  }

  const profile = getProfile(settings.profileId);
  const enabledProfiles = settings.enabledProfileIds.map(getProfile);
  const fieldValues = settings.meetingFields.values[profile.id] ?? {};
  // The pending record also describes the LIVE attempt's session (written at every
  // start as its crash ledger), so the banner must stay hidden while busy — surfacing
  // it mid-recording invites a "discard" that aborts the in-flight upload server-side.
  const showRecovery = pending != null && !view.busy;
  const showForm = !view.busy && !view.done;

  const handleFieldChange = (key: string, value: string) =>
    update(applyFieldChange(settings, profile.id, key, value));

  const handleCta = () => {
    if (view.ctaKind === "newRecording") {
      sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.dismissError });
      update(clearMeetingFields(settings));
      return;
    }

    if (view.ctaKind === "grantMic") {
      openPermissionPage();
      return;
    }

    setStarting(true);
    sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.toggleRecording });
  };

  return (
    <div className={`popup${overlay !== "none" ? " with-overlay" : ""}`}>
      {overlay === "onboarding" ? (
        <OnboardingOverlay
          micGranted={micGranted}
          onSaveUserId={(userId) => update({ userId })}
          onClose={() => setOverlay("none")}
        />
      ) : null}
      {overlay === "settings" ? (
        <SettingsOverlay
          settings={settings}
          onUpdate={update}
          onClose={() => setOverlay("none")}
        />
      ) : null}

      <Header onGear={() => setOverlay("settings")} />

      {showRecovery ? <RecoveryBanner /> : null}

      <main className="popup-body">
        {view.busy ? (
          <RecordingCard
            snapshot={snapshot}
            onStop={() => sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.toggleRecording })}
          />
        ) : null}

        {view.done ? <StatusCard snapshot={snapshot} /> : null}

        {showForm ? (
          <>
            {enabledProfiles.length > 1 ? (
              <ProfileTabs
                profiles={enabledProfiles}
                selected={settings.profileId}
                onSelect={(profileId) => update({ profileId })}
              />
            ) : null}

            <ProfileFieldsForm
              profile={profile}
              values={fieldValues}
              pitches={settings.pitches}
              onChange={handleFieldChange}
            />

            {view.notOnMeet ? <ContextualNotice kind="meet" /> : null}
            {!view.notOnMeet && view.needsMic ? <ContextualNotice kind="mic" /> : null}
          </>
        ) : null}
      </main>

      {!view.busy && !showRecovery ? (
        <CtaBar
          kind={view.ctaKind}
          disabled={!view.canStart}
          loading={starting}
          onClick={handleCta}
        />
      ) : null}
    </div>
  );
};
