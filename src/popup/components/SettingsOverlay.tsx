import { useState } from "react";

import { PROFILES } from "../../profiles/profiles";
import { t } from "../../shared/i18n";
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
