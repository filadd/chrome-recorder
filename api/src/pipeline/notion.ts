// Notion integration for the `project` profile (spec §8 "Project branch").
// Anchored on the pitch page id carried in object metadata, it keeps two child
// pages under the pitch:
//   - "🎙 Meeting log" — one dated entry appended per recording.
//   - "🧭 Current context" — the living context, rewritten each run.
// Block shapes follow the documented REST API; verify rendering against the real
// workspace before relying on it in production.

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MEETING_LOG_TITLE = "🎙 Meeting log";
const CONTEXT_TITLE = "🧭 Current context";
// Notion caps a single rich-text run at 2000 chars; stay under it.
const TEXT_LIMIT = 1900;

type Block = Record<string, unknown>;

interface RichText {
  plain_text?: string;
}

interface ChildBlock {
  id: string;
  type: string;
  child_page?: { title: string };
  paragraph?: { rich_text?: RichText[] };
}

const api = async (
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> => {
  const response = await fetch(`${NOTION_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Notion ${method} ${path} failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
};

const chunkText = (text: string, size: number): string[] => {
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }

  return chunks.length > 0 ? chunks : [""];
};

const paragraph = (content: string): Block => ({
  object: "block",
  type: "paragraph",
  paragraph: {
    rich_text: content === "" ? [] : [{ type: "text", text: { content } }],
  },
});

const heading = (content: string): Block => ({
  object: "block",
  type: "heading_2",
  heading_2: { rich_text: [{ type: "text", text: { content } }] },
});

const transcriptToggle = (transcript: string): Block => ({
  object: "block",
  type: "toggle",
  toggle: {
    rich_text: [{ type: "text", text: { content: "Transcript" } }],
    children: chunkText(transcript === "" ? "—" : transcript, TEXT_LIMIT).map(paragraph),
  },
});

const listChildren = async (apiKey: string, blockId: string): Promise<ChildBlock[]> => {
  const blocks: ChildBlock[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: "100" });

    if (cursor != null) {
      params.set("start_cursor", cursor);
    }

    const result = (await api(apiKey, "GET", `/blocks/${blockId}/children?${params}`)) as {
      results: ChildBlock[];
      has_more: boolean;
      next_cursor: string | null;
    };

    blocks.push(...result.results);
    cursor = result.has_more ? (result.next_cursor ?? undefined) : undefined;
  } while (cursor != null);

  return blocks;
};

const findChildPage = (children: ChildBlock[], title: string): string | null =>
  children.find((block) => block.type === "child_page" && block.child_page?.title === title)?.id ??
  null;

const ensureChildPage = async (
  apiKey: string,
  parentId: string,
  title: string,
): Promise<string> => {
  const existing = findChildPage(await listChildren(apiKey, parentId), title);

  if (existing != null) {
    return existing;
  }

  const page = (await api(apiKey, "POST", "/pages", {
    parent: { page_id: parentId },
    properties: { title: { title: [{ type: "text", text: { content: title } }] } },
  })) as { id: string };

  return page.id;
};

const appendChildren = (apiKey: string, blockId: string, children: Block[]): Promise<unknown> =>
  api(apiKey, "PATCH", `/blocks/${blockId}/children`, { children });

export interface MeetingEntry {
  date: string;
  participants: string;
  summary: string;
  transcript: string;
}

export const appendMeetingEntry = async (
  apiKey: string,
  pitchId: string,
  entry: MeetingEntry,
): Promise<void> => {
  const logId = await ensureChildPage(apiKey, pitchId, MEETING_LOG_TITLE);

  await appendChildren(apiKey, logId, [
    heading(`${entry.date} · ${entry.participants}`),
    paragraph(entry.summary),
    transcriptToggle(entry.transcript),
  ]);
};

export const readLivingContext = async (apiKey: string, pitchId: string): Promise<string> => {
  const contextId = findChildPage(await listChildren(apiKey, pitchId), CONTEXT_TITLE);

  if (contextId == null) {
    return "";
  }

  const blocks = await listChildren(apiKey, contextId);

  return blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => (block.paragraph?.rich_text ?? []).map((t) => t.plain_text ?? "").join(""))
    .join("\n")
    .trim();
};

// Rewrites the living context: archive the page's current blocks, then append the
// merged text the LLM produced. (Archive-then-append rather than in-place edit
// because Notion has no "replace all children" call.)
export const writeLivingContext = async (
  apiKey: string,
  pitchId: string,
  text: string,
): Promise<void> => {
  const contextId = await ensureChildPage(apiKey, pitchId, CONTEXT_TITLE);

  for (const block of await listChildren(apiKey, contextId)) {
    await api(apiKey, "PATCH", `/blocks/${block.id}`, { archived: true });
  }

  await appendChildren(
    apiKey,
    contextId,
    chunkText(text === "" ? "—" : text, TEXT_LIMIT).map(paragraph),
  );
};
