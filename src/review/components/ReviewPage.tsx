import { useEffect, useState } from "react";

import { t } from "../../shared/i18n";
import { sendMessage } from "../../shared/messages";
import { fetchReview, submitReview } from "../review-client";
import type { ReviewArtifact, ReviewSpeaker, SpeakerNaming } from "../types";

type Status = "loading" | "ready" | "error" | "submitting" | "done";

const reviewKey = (): string | null => new URLSearchParams(window.location.search).get("key");

export const ReviewPage = () => {
  const [status, setStatus] = useState<Status>("loading");
  const [artifact, setArtifact] = useState<ReviewArtifact | null>(null);

  // Per-speaker edits, keyed by speaker index.
  const [names, setNames] = useState<Record<number, string>>({});
  const [merges, setMerges] = useState<Record<number, number | null>>({});
  const [ignores, setIgnores] = useState<Record<number, boolean>>({});

  const key = reviewKey();

  useEffect(() => {
    if (key == null) {
      setStatus("error");
      return;
    }

    fetchReview(key)
      .then((data) => {
        setArtifact(data);
        setNames(Object.fromEntries(data.speakers.map((s) => [s.index, s.guess])));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const labelFor = (speaker: ReviewSpeaker): string =>
    (names[speaker.index] ?? "").trim() || t("review_speaker", [String(speaker.index)]);

  const handleSubmit = async () => {
    if (key == null || artifact == null) {
      return;
    }

    const naming: SpeakerNaming = { names: {}, merges: [], ignores: [] };

    for (const speaker of artifact.speakers) {
      if (ignores[speaker.index]) {
        naming.ignores.push(speaker.index);
        continue;
      }

      const target = merges[speaker.index];

      if (target != null) {
        naming.merges.push([speaker.index, target]);
        continue;
      }

      const name = (names[speaker.index] ?? "").trim();

      if (name !== "") {
        naming.names[speaker.index] = name;
      }
    }

    setStatus("submitting");

    try {
      await submitReview(key, naming);
      await sendMessage({ target: "sw", type: "review-submitted", key });
      setStatus("done");
      setTimeout(() => window.close(), 1500);
    } catch {
      setStatus("error");
    }
  };

  if (status === "loading") {
    return (
      <main className="review">
        <p className="review-note">{t("review_loading")}</p>
      </main>
    );
  }

  if (status === "error" || artifact == null) {
    return (
      <main className="review">
        <p className="review-note err">{t("review_error")}</p>
      </main>
    );
  }

  if (status === "done") {
    return (
      <main className="review">
        <p className="review-note ok">{t("review_done")}</p>
      </main>
    );
  }

  const submitting = status === "submitting";

  return (
    <main className="review">
      <header className="review-head">
        <div className="badge">F</div>
        <div>
          <h1>{t("review_page_title")}</h1>
          <p className="review-note">{t("review_intro")}</p>
        </div>
      </header>

      {artifact.speakers.map((speaker) => {
        const ignored = ignores[speaker.index] === true;
        const mergedInto = merges[speaker.index] ?? null;
        const locked = ignored || mergedInto != null;
        const others = artifact.speakers.filter((other) => other.index !== speaker.index);

        return (
          <section key={speaker.index} className={`speaker${ignored ? " ignored" : ""}`}>
            <div className="speaker-head">
              <span className="speaker-tag">{t("review_speaker", [String(speaker.index)])}</span>
              {speaker.guess !== "" ? (
                <span className="speaker-guess">{t("review_guess", [speaker.guess])}</span>
              ) : null}
            </div>

            <ul className="samples">
              {speaker.samples.map((sample, i) => (
                <li key={i}>“{sample}”</li>
              ))}
            </ul>

            <input
              className="speaker-name"
              type="text"
              placeholder={t("review_name_ph")}
              value={names[speaker.index] ?? ""}
              disabled={locked || submitting}
              onChange={(event) =>
                setNames((prev) => ({ ...prev, [speaker.index]: event.target.value }))
              }
            />

            <div className="speaker-controls">
              <label className="speaker-merge">
                {t("review_merge")}
                <select
                  value={mergedInto ?? ""}
                  disabled={ignored || submitting}
                  onChange={(event) =>
                    setMerges((prev) => ({
                      ...prev,
                      [speaker.index]: event.target.value === "" ? null : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">{t("review_merge_none")}</option>
                  {others.map((other) => (
                    <option key={other.index} value={other.index}>
                      {labelFor(other)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="speaker-ignore">
                <input
                  type="checkbox"
                  checked={ignored}
                  disabled={submitting}
                  onChange={(event) =>
                    setIgnores((prev) => ({ ...prev, [speaker.index]: event.target.checked }))
                  }
                />
                {t("review_ignore")}
              </label>
            </div>
          </section>
        );
      })}

      <button className="review-submit" onClick={handleSubmit} disabled={submitting}>
        {submitting ? t("review_submitting") : t("review_submit")}
      </button>
    </main>
  );
};
