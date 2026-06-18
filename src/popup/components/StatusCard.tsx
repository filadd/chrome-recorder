import { t } from "../../shared/i18n";
import { UI_STATE, type UiSnapshot } from "../../shared/storage";

interface Props {
  snapshot: UiSnapshot;
}

export const StatusCard = ({ snapshot }: Props) => {
  const ok = snapshot.state === UI_STATE.finished;

  return (
    <div className={`status-card ${ok ? "ok" : "err"}`}>
      <span className="status-icon">{ok ? "✓" : "!"}</span>
      <span className="status-label">
        {ok ? t("popup_status_finished") : t("card_upload_failed")}
      </span>
      <span className="status-sub">{ok ? t("card_finished_sub") : (snapshot.error ?? "")}</span>
    </div>
  );
};
