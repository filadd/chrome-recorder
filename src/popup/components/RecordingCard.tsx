import { t } from "../../shared/i18n";
import { UI_STATE, type UiSnapshot } from "../../shared/storage";
import { useElapsedTimer } from "../hooks/useElapsedTimer";

interface Props {
  snapshot: UiSnapshot;
  onStop: () => void;
}

export const RecordingCard = ({ snapshot, onStop }: Props) => {
  const recording = snapshot.state === UI_STATE.recording;
  const stoppable = recording || snapshot.state === UI_STATE.arming;
  const elapsed = useElapsedTimer(recording ? snapshot.startedAt : null);

  return (
    <div className={`rec-card${recording ? " live" : ""}`}>
      <div className="rec-row">
        {recording ? <span className="rec-dot" /> : null}
        <span className="rec-label">{t(`popup_status_${snapshot.state}`)}</span>
        {recording ? <span className="rec-timer">{elapsed}</span> : null}
      </div>

      {recording && snapshot.micMuted ? (
        <span className="rec-muted">{t("overlay_mic_muted")}</span>
      ) : null}

      {snapshot.state === UI_STATE.finalizing ? (
        <>
          <div className="upload-track">
            <div className="upload-fill" />
          </div>
          <span className="upload-label">
            {t("card_parts_done", String(snapshot.partsDone))}
          </span>
        </>
      ) : null}

      {stoppable ? (
        <button className="stop-btn" onClick={onStop}>
          ■ {t("popup_stop")}
        </button>
      ) : null}
    </div>
  );
};
