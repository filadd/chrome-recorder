import type { AutoField } from "../profiles/types";

export const resolveAutoFields = (
  autoFields: AutoField[],
  { meetSlug, userId }: { meetSlug: string | null; userId: string },
): Record<string, string> => {
  const now = new Date();

  const values: Record<AutoField, string> = {
    meetSlug: meetSlug ?? "no-meet",
    timestamp: now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"),
    userId: userId || "anonymous",
    uuid: crypto.randomUUID(),
  };

  return Object.fromEntries(autoFields.map((field) => [field, values[field]]));
};
