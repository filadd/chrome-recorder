import type { ProfileField, RecordingProfile } from "../../profiles/types";
import { t } from "../../shared/i18n";
import type { PitchEntry } from "../../shared/storage";
import { PitchField } from "./PitchField";

interface Props {
  profile: RecordingProfile;
  values: Record<string, string>;
  pitches: PitchEntry[];
  onChange: (key: string, value: string) => void;
}

export const ProfileFieldsForm = ({ profile, values, pitches, onChange }: Props) => {
  const control = (field: ProfileField, value: string, missing: boolean) => {
    const handleChange = (next: string) => onChange(field.key, next);

    if (field.key === "pitchId") {
      return <PitchField value={value} pitches={pitches} onChange={handleChange} />;
    }

    return (
      <input
        className={`field-input${missing ? " err" : ""}`}
        type="text"
        placeholder={t(field.placeholderKey)}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
      />
    );
  };

  return (
    <>
      <p className="profile-desc">{t(profile.descriptionKey)}</p>

      {profile.fields.map((field) => {
        const value = values[field.key] ?? "";
        const missing = field.required && value.trim() === "";

        return (
          <div key={field.key} className="field">
            <label className="field-label">
              {t(field.labelKey)}
              {field.required ? <span className="field-required"> *</span> : null}
            </label>
            {control(field, value, missing)}
          </div>
        );
      })}
    </>
  );
};
