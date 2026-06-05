import { useState } from "react";

import { t } from "../../shared/i18n";
import { openPermissionPage } from "../open-permission-page";

interface Props {
  micGranted: boolean;
  onSaveUserId: (userId: string) => void;
  onClose: () => void;
}

export const OnboardingOverlay = ({ micGranted, onSaveUserId, onClose }: Props) => {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");

  const valid = /.+@.+\..+/.test(email.trim());

  const handleContinue = () => {
    onSaveUserId(email.trim());

    if (micGranted) {
      onClose();
      return;
    }

    setStep(1);
  };

  return (
    <div className="overlay">
      <button className="overlay-close" onClick={onClose}>
        ✕
      </button>

      <div className="overlay-badge">F</div>

      <div className="overlay-dots">
        <span className={`overlay-dot${step === 0 ? " on" : ""}`} />
        <span className={`overlay-dot${step === 1 ? " on" : ""}`} />
      </div>

      {step === 0 ? (
        <>
          <h2 className="overlay-title">{t("onboarding_welcome_title")}</h2>
          <p className="overlay-body">{t("onboarding_identifier_body")}</p>
          <input
            className="overlay-input"
            type="email"
            placeholder={t("popup_userid_placeholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
          <button className="overlay-cta" disabled={!valid} onClick={handleContinue}>
            {t("onboarding_continue")}
          </button>
        </>
      ) : (
        <>
          <h2 className="overlay-title">{t("onboarding_mic_title")}</h2>
          <p className="overlay-body">{t("onboarding_mic_body")}</p>
          <button
            className="overlay-cta"
            onClick={() => {
              openPermissionPage();
              onClose();
            }}
          >
            {t("onboarding_grant_mic")}
          </button>
          <button className="overlay-skip" onClick={onClose}>
            {t("onboarding_skip")}
          </button>
        </>
      )}
    </div>
  );
};
