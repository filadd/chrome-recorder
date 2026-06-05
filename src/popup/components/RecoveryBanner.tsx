import { t } from "../../shared/i18n";
import { sendMessage } from "../../shared/messages";

export const RecoveryBanner = () => (
  <div className="recovery">
    <p className="recovery-msg">{t("popup_recovery_notice")}</p>
    <div className="recovery-row">
      <button
        className="recovery-btn retry"
        onClick={() => sendMessage({ target: "sw", type: "recover-retry" })}
      >
        {t("popup_recover_retry")}
      </button>
      <button
        className="recovery-btn discard"
        onClick={() => sendMessage({ target: "sw", type: "recover-abort" })}
      >
        {t("popup_recover_abort")}
      </button>
    </div>
  </div>
);
