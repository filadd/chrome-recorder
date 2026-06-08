import type { ServerProfile } from "./profiles";

const SEGMENT_ALLOWLIST = /[^a-zA-Z0-9_\-.]/g;

// Values come from an untrusted client: each placeholder value is flattened to a
// single safe path segment so a tampered extension can't escape its key prefix.
export const sanitizeSegment = (value: string): string => {
  const cleaned = value.replace(SEGMENT_ALLOWLIST, "-").replace(/\.{2,}/g, ".").slice(0, 128);

  return cleaned.replace(/^[.-]+|[.-]+$/g, "") || "unknown";
};

export const renderKey = (
  profile: ServerProfile,
  auto: Record<string, string>,
  fields: Record<string, string>,
): string => {
  const values = { ...fields, ...auto };

  return profile.keyTemplate.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];

    if (value == null || value.trim() === "") {
      throw new Error(`Missing value for key placeholder {${name}}`);
    }

    return sanitizeSegment(value);
  });
};

// Object metadata is the contract with the processing pipeline (see spec §2):
// only these keys are stamped, under their snake_case pipeline names.
const META_KEYS: Record<string, string> = {
  pitchId: "pitch_id",
  meetSlug: "meet_slug",
  userId: "recorded_by",
  timestamp: "started_at",
};

// S3 caps user metadata at 2 KB total and RFC-2047-mangles non-ASCII values on
// read — diacritics are folded and anything else non-ASCII dropped instead.
const METADATA_BYTE_LIMIT = 2048;

const sanitizeMetaValue = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, 256);

export const buildObjectMetadata = (
  profile: ServerProfile,
  auto: Record<string, string>,
  fields: Record<string, string>,
): Record<string, string> | undefined => {
  if (!profile.attachAsObjectMetadata) {
    return undefined;
  }

  const metadata: Record<string, string> = {};
  let budget = METADATA_BYTE_LIMIT;

  for (const [key, raw] of [...Object.entries(auto), ...Object.entries(fields)]) {
    const metaKey = META_KEYS[key];
    const value = raw == null ? "" : sanitizeMetaValue(String(raw));

    if (metaKey == null || value === "") {
      continue;
    }

    const room = budget - metaKey.length;

    if (room <= 0) {
      break;
    }

    metadata[metaKey] = value.slice(0, room);
    budget -= metaKey.length + metadata[metaKey].length;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
};
