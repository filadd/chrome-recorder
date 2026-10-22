import { useState } from "react";

import { AuthLoginError, requestEmailCode, verifyEmailCode } from "../../shared/auth-client";
import type { StoredSession } from "../../shared/auth-session";
import { t } from "../../shared/i18n";
import { openPermissionPage } from "../open-permission-page";

interface Props {
  micGranted: boolean;
  onAuthenticated: (session: StoredSession) => void;
  onClose: () => void;
}

const STEP = { email: 0, code: 1, mic: 2 } as const;
type Step = (typeof STEP)[keyof typeof STEP];

export const OnboardingOverlay = ({ micGranted, onAuthenticated, onClose }: Props) => {
  const [step, setStep] = useState<Step>(STEP.email);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /.+@.+\..+/.test(email.trim());
  const codeValid = /^\d{6}$/.test(code.trim());

  const sendCode = async () => {
    setBusy(true);
    setError(null);

    try {
      await requestEmailCode(email.trim());
      setCode("");
      setStep(STEP.code);
    } catch (err) {
      setError(
        err instanceof AuthLoginError && err.status === 429
          ? t("login_error_rate")
          : t("login_error_send"),
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);

    try {
      const session = await verifyEmailCode(email.trim(), code.trim());
      onAuthenticated(session);

      if (micGranted) {
        onClose();
        return;
      }

      setStep(STEP.mic);
    } catch {
      setError(t("login_error_code"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-close" onClick={onClose}>
        ✕
      </button>

      <div className="overlay-badge">F</div>

      <div className="overlay-dots">
        <span className={`overlay-dot${step === STEP.email ? " on" : ""}`} />
        <span className={`overlay-dot${step === STEP.code ? " on" : ""}`} />
        <span className={`overlay-dot${step === STEP.mic ? " on" : ""}`} />
      </div>

      {step === STEP.email ? (
        <>
          <h2 className="overlay-title">{t("login_email_title")}</h2>
          <p className="overlay-body">{t("login_email_body")}</p>
          <input
            className="overlay-input"
            type="email"
            placeholder={t("login_email_placeholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
          {error != null ? <span className="field-hint">{error}</span> : null}
          <button className="overlay-cta" disabled={!emailValid || busy} onClick={sendCode}>
            {busy ? t("login_sending") : t("login_send_code")}
          </button>
        </>
      ) : null}

      {step === STEP.code ? (
        <>
          <h2 className="overlay-title">{t("login_code_title")}</h2>
          <p className="overlay-body">{t("login_code_body", email.trim())}</p>
          <input
            className="overlay-input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder={t("login_code_placeholder")}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          {error != null ? <span className="field-hint">{error}</span> : null}
          <button className="overlay-cta" disabled={!codeValid || busy} onClick={verify}>
            {busy ? t("login_verifying") : t("login_verify")}
          </button>
          <button className="overlay-secondary" disabled={busy} onClick={sendCode}>
            {t("login_resend")}
          </button>
          <button
            className="overlay-skip"
            onClick={() => {
              setError(null);
              setCode("");
              setStep(STEP.email);
            }}
          >
            {t("login_change_email")}
          </button>
        </>
      ) : null}

      {step === STEP.mic ? (
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
      ) : null}
    </div>
  );
};
