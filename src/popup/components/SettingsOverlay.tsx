import { useState } from "react";

import { PROFILES } from "../../profiles/profiles";
import { t } from "../../shared/i18n";
import { extractNotionPageId } from "../../shared/notion";
import { applyProfileToggle } from "../../shared/profile-toggle";
import type { Settings } from "../../shared/storage";

interface Props {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export const SettingsOverlay = ({ settings, onUpdate, onClose }: Props) => {
  const [email, setEmail] = useState(settings.userId);

  const valid = /.+@.+\..+/.test(email.trim());

  const [pitchLabel, setPitchLabel] = useState("");
  const [pitchUrl, setPitchUrl] = useState("");

  const pitchId = extractNotionPageId(pitchUrl);
  const pitchUrlInvalid = pitchUrl.trim() !== "" && pitchId == null;
  const canAddPitch = pitchLabel.trim() !== "" && pitchId != null;

  const handleAddPitch = () => {
    if (pitchId == null) {
      return;
    }

    onUpdate({
      pitches: [
        ...settings.pitches.filter((pitch) => pitch.id !== pitchId),
        { id: pitchId, label: pitchLabel.trim(), url: pitchUrl.trim() },
      ],
    });
    setPitchLabel("");
    setPitchUrl("");
  };

  const handleRemovePitch = (id: string) =>
    onUpdate({ pitches: settings.pitches.filter((pitch) => pitch.id !== id) });

  return (
    <div className="overlay">
      <button className="overlay-close" onClick={onClose}>
        ✕
      </button>

      <h2 className="overlay-title">{t("settings_title")}</h2>

      <div className="field">
        <label className="field-label">{t("popup_userid_label")}</label>
        <input
          className="overlay-input"
          type="email"
          placeholder={t("popup_userid_placeholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label">{t("settings_profiles_label")}</label>
        {Object.values(PROFILES).map((profile) => {
          const enabled = settings.enabledProfileIds.includes(profile.id);
          const lastEnabled = enabled && settings.enabledProfileIds.length === 1;

          return (
            <label key={profile.id} className="profile-toggle">
              <input
                type="checkbox"
                checked={enabled}
                disabled={lastEnabled}
                onChange={(event) =>
                  onUpdate(applyProfileToggle(settings, profile.id, event.target.checked))
                }
              />
              {t(profile.labelKey)}
            </label>
          );
        })}
        <p className="field-note">{t("settings_profile_min_one")}</p>
      </div>

      <div className="field">
        <label className="field-label">{t("settings_pitches_label")}</label>

        {settings.pitches.map((pitch) => (
          <div key={pitch.id} className="pitch-row">
            <span className="pitch-label" title={pitch.url}>
              {pitch.label}
            </span>
            <button className="pitch-remove" onClick={() => handleRemovePitch(pitch.id)}>
              ✕
            </button>
          </div>
        ))}

        <input
          className="overlay-input"
          type="text"
          placeholder={t("settings_pitch_label_ph")}
          value={pitchLabel}
          onChange={(event) => setPitchLabel(event.target.value)}
        />
        <input
          className={`overlay-input${pitchUrlInvalid ? " err" : ""}`}
          type="url"
          placeholder={t("settings_pitch_url_ph")}
          value={pitchUrl}
          onChange={(event) => setPitchUrl(event.target.value)}
        />
        {pitchUrlInvalid ? (
          <span className="field-hint">{t("settings_pitch_invalid_url")}</span>
        ) : null}
        <button className="overlay-secondary" disabled={!canAddPitch} onClick={handleAddPitch}>
          {t("settings_pitch_add")}
        </button>
      </div>

      <button
        className="overlay-cta"
        disabled={!valid}
        onClick={() => {
          onUpdate({ userId: email.trim() });
          onClose();
        }}
      >
        {t("settings_save")}
      </button>
    </div>
  );
};
