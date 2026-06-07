const ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32}/gi;

// Notion page URLs end with the page id, dashed or not ("Page-Title-<32hex>",
// "/p/<32hex>"). Only the pathname is scanned — query params like ?v= carry
// view ids that would otherwise match — and the last id wins.
export const extractNotionPageId = (raw: string): string | null => {
  let pathname: string;

  try {
    pathname = new URL(raw.trim()).pathname;
  } catch {
    return null;
  }

  const matches = pathname.match(ID_PATTERN);

  return matches == null ? null : matches[matches.length - 1].replace(/-/g, "").toLowerCase();
};
