import { t } from "../../shared/i18n";

interface Props {
  onGear: () => void;
}

export const Header = ({ onGear }: Props) => (
  <header className="header">
    <img src="/icons/icon48.png" alt="" width={20} height={20} />
    <h1 className="header-name">{t("extension_name")}</h1>
    <button className="gear" title={t("settings_title")} onClick={onGear}>
      ⚙
    </button>
  </header>
);
