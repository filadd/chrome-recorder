import { MEET_SLUG_REGEX } from "./constants";

export const extractMeetSlug = (url: string | undefined): string | null =>
  url?.match(MEET_SLUG_REGEX)?.[1]?.toLowerCase() ?? null;
