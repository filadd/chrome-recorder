import { openFiladdLogin } from "../../shared/auth";
import { useFiladdAuth } from "../../shared/hooks/useFiladdAuth";
import { t } from "../../shared/i18n";
import { useTodaySessions } from "../hooks/useTodaySessions";

interface Props {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

const timeLabel = (date: Date): string =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Dropdown of today's sessions for the logged-in orientador; degrades to a
// manual session-id input whenever auth or the gateway is unavailable, so
// recording is never blocked by the picker (spec §5).
export const SessionField = ({ value, placeholder, onChange }: Props) => {
  const [auth, authLoaded] = useFiladdAuth();
  const { sessions, status } = useTodaySessions(auth?.token ?? null);

  if (!authLoaded) {
    return null;
  }

  const manualInput = (
    <input
      className={`field-input${value.trim() === "" ? " err" : ""}`}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );

  if (auth == null) {
    return (
      <>
        {manualInput}
        <button className="field-login" onClick={openFiladdLogin}>
          {t("session_login_cta")}
        </button>
        <span className="field-note">{t("session_login_prompt")}</span>
      </>
    );
  }

  if (status === "loading") {
    return (
      <select className="field-input" disabled>
        <option>{t("session_select_loading")}</option>
      </select>
    );
  }

  if (status === "error" || sessions.length === 0) {
    return (
      <>
        {manualInput}
        <span className="field-note">
          {status === "error" ? t("session_fetch_error") : t("session_select_empty")}
        </span>
      </>
    );
  }

  return (
    <select
      className={`field-input${value.trim() === "" ? " err" : ""}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t("session_select_placeholder")}</option>
      {sessions.map((session) => (
        <option key={session.id} value={String(session.id)}>
          {timeLabel(session.startTime)} · {session.studentName}
        </option>
      ))}
    </select>
  );
};
