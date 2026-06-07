import { t } from "../../shared/i18n";
import type { PitchEntry } from "../../shared/storage";

interface Props {
  value: string;
  pitches: PitchEntry[];
  onChange: (value: string) => void;
}

// Select over the settings-managed pitch list; with nothing registered yet it
// points the user at the settings gear instead of rendering an empty select.
export const PitchField = ({ value, pitches, onChange }: Props) => {
  if (pitches.length === 0) {
    return <span className="field-note">{t("pitch_list_empty")}</span>;
  }

  return (
    <select
      className={`field-input${value.trim() === "" ? " err" : ""}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t("pitch_select_placeholder")}</option>
      {pitches.map((pitch) => (
        <option key={pitch.id} value={pitch.id}>
          {pitch.label}
        </option>
      ))}
    </select>
  );
};
