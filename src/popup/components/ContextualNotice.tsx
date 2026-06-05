import { t } from "../../shared/i18n";

interface Props {
  kind: "meet" | "mic";
}

export const ContextualNotice = ({ kind }: Props) => (
  <p className={`notice ${kind}`}>
    {kind === "meet" ? t("notice_open_meet") : t("notice_needs_mic")}
  </p>
);
