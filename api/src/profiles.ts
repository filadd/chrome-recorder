// Server-side copy of the extension's profile table (src/profiles/profiles.ts).
// The stand-in is the trust boundary: it validates the client's fields and renders
// the file-uploads upload configuration here — the object key, destination, and
// metadata are never accepted from the client. file-uploads-api generates the key.

// Profile ids live in a const map so the type derives from the table — adding or
// removing a profile never means editing a hand-written union.
export const PROFILE_IDS = {
  project: "project",
} as const;

export type ProfileId = (typeof PROFILE_IDS)[keyof typeof PROFILE_IDS];

export interface ServerProfile {
  id: ProfileId;
  // file-uploads-api's MIME_TYPES Literal accepts `video/webm` but NOT `audio/webm`,
  // so the opus-in-webm recording is declared as video/webm (what python-magic
  // detects for it) — otherwise the create request 422s before any S3 work.
  contentType: string;
  fileExtension: string;
  allowedMimetypes: string[];
  requiredFields: string[];
  // Notion page id: 32 hex chars (uuid with the dashes stripped client-side).
  fieldPatterns: Record<string, RegExp>;
}

export const PROFILES: Record<ProfileId, ServerProfile> = {
  [PROFILE_IDS.project]: {
    id: PROFILE_IDS.project,
    contentType: "video/webm",
    fileExtension: ".webm",
    allowedMimetypes: ["video/webm"],
    requiredFields: ["pitchId"],
    fieldPatterns: { pitchId: /^[0-9a-f]{32}$/ },
  },
};

export const getProfile = (id: string): ServerProfile | null =>
  (PROFILES as Record<string, ServerProfile>)[id] ?? null;
