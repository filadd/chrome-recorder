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

export const buildObjectMetadata = (
  profile: ServerProfile,
  auto: Record<string, string>,
  fields: Record<string, string>,
): Record<string, string> | undefined => {
  if (!profile.attachAsObjectMetadata) {
    return undefined;
  }

  const entries = [...Object.entries(auto), ...Object.entries(fields)]
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => [key.toLowerCase(), String(value).slice(0, 256)]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};
