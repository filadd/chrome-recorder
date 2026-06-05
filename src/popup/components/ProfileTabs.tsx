import type { RecordingProfile } from "../../profiles/types";
import type { ProfileId } from "../../profiles/types";
import { t } from "../../shared/i18n";

interface Props {
  profiles: RecordingProfile[];
  selected: ProfileId;
  onSelect: (profileId: ProfileId) => void;
}

export const ProfileTabs = ({ profiles, selected, onSelect }: Props) => (
  <div className="profile-tabs">
    {profiles.map((profile) => (
      <button
        key={profile.id}
        className={`profile-tab${selected === profile.id ? " on" : ""}`}
        onClick={() => onSelect(profile.id)}
      >
        {t(profile.labelKey)}
      </button>
    ))}
  </div>
);
