import { t } from "../../shared/i18n";
import type { CtaKind } from "../view-state";

const CTA_LABEL_KEYS: Record<CtaKind, string> = {
  start: "popup_start",
  meetFirst: "cta_open_meet_first",
  grantMic: "popup_grant_mic",
  newRecording: "cta_new_recording",
};

interface Props {
  kind: CtaKind;
  disabled: boolean;
  onClick: () => void;
}

export const CtaBar = ({ kind, disabled, onClick }: Props) => (
  <div className="cta-bar">
    {kind !== "newRecording" ? <p className="cta-note">{t("popup_required_note")}</p> : null}
    <button
      className={`cta${kind === "newRecording" ? " back" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {kind === "start" ? <span className="cta-dot">● </span> : null}
      {kind === "newRecording" ? "← " : null}
      {t(CTA_LABEL_KEYS[kind])}
    </button>
  </div>
);
