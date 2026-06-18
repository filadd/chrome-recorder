import { t } from "../../shared/i18n";
import { MESSAGE_TARGET, sendMessage, SW_MESSAGE_TYPE } from "../../shared/messages";

export const RecoveryBanner = () => (
  <div className="recovery">
    <p className="recovery-msg">{t("popup_recovery_notice")}</p>
    <div className="recovery-row">
      <button
        className="recovery-btn retry"
        onClick={() => sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.recoverRetry })}
      >
        {t("popup_recover_retry")}
      </button>
      <button
        className="recovery-btn discard"
        onClick={() => sendMessage({ target: MESSAGE_TARGET.sw, type: SW_MESSAGE_TYPE.recoverAbort })}
      >
        {t("popup_recover_abort")}
      </button>
    </div>
  </div>
);
