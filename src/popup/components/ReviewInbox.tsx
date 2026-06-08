import { t } from "../../shared/i18n";
import type { PitchEntry } from "../../shared/storage";
import type { ReviewSummary } from "../../review/types";
import { openReviewPage } from "../open-review-page";

interface Props {
  items: ReviewSummary[];
  pitches: PitchEntry[];
}

const shortDate = (iso: string): string => {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

export const ReviewInbox = ({ items, pitches }: Props) => {
  const labelFor = (pitchId: string) =>
    pitches.find((pitch) => pitch.id === pitchId)?.label ?? t("review_unknown_pitch");

  return (
    <div className="inbox">
      <p className="inbox-title">{t("inbox_title", [String(items.length)])}</p>

      {items.map((item) => (
        <button key={item.key} className="inbox-row" onClick={() => openReviewPage(item.key)}>
          <span className="inbox-pitch">{labelFor(item.pitchId)}</span>
          <span className="inbox-date">{shortDate(item.createdAt)}</span>
          <span className="inbox-cta">{t("inbox_open")}</span>
        </button>
      ))}
    </div>
  );
};
