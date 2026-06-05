import type { RecordingProfile } from "../../profiles/types";
import { t } from "../../shared/i18n";

interface Props {
  profile: RecordingProfile;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export const ProfileFieldsForm = ({ profile, values, onChange }: Props) => (
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
          <input
            className={`field-input${missing ? " err" : ""}`}
            type="text"
            placeholder={t(field.placeholderKey)}
            value={value}
            onChange={(event) => onChange(field.key, event.target.value)}
          />
          {missing ? <span className="field-hint">{t("field_required_hint")}</span> : null}
        </div>
      );
    })}
  </>
);
