import { API_BASE_URL, API_TOKEN } from "../shared/constants";
import type { ReviewArtifact, ReviewSummary, SpeakerNaming } from "./types";

// The review endpoints share the upload API's base URL + static bearer token
// (auth scoping is by the shared token, so `recordedBy` is a trusted param).
const authHeaders = { Authorization: `Bearer ${API_TOKEN}` };

export const fetchPendingReviews = async (recordedBy: string): Promise<ReviewSummary[]> => {
  const res = await fetch(
    `${API_BASE_URL}/reviews?recordedBy=${encodeURIComponent(recordedBy)}`,
    { headers: authHeaders },
  );

  if (!res.ok) {
    throw new Error(`reviews list failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()).reviews as ReviewSummary[];
};

export const fetchReview = async (key: string): Promise<ReviewArtifact> => {
  const res = await fetch(`${API_BASE_URL}/reviews/item?key=${encodeURIComponent(key)}`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    throw new Error(`review fetch failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<ReviewArtifact>;
};

export const submitReview = async (key: string, naming: SpeakerNaming): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/reviews/finalize`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ key, naming }),
  });

  if (!res.ok) {
    throw new Error(`review submit failed: ${res.status} ${await res.text()}`);
  }
};
