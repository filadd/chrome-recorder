// Notion is the datastore, the review surface, and the delivery target. The stand-in
// talks to it over the raw REST API (version 2022-06-28) with an internal-integration
// token — deliberately HTTP-shaped so it doubles as the spec for n8n's Notion nodes.
//
// Four databases (created global + related, see spec.md §7): Transcriptions hold one
// row per recording with nested-by-relation Segments and Speakers; Contexts hold the
// durable living context per pitch. Property names are the contract with those DBs and
// live in NOTION_PROPS so both sides stay in lockstep.

export const TRANSCRIPTION_STATE = {
  pending: "pending",
  speakersAssigned: "speakers_assigned",
  delivered: "delivered",
  failed: "failed",
} as const;

export type TranscriptionState =
  (typeof TRANSCRIPTION_STATE)[keyof typeof TRANSCRIPTION_STATE];

export const NOTION_PROPS = {
  transcription: {
    name: "Name",
    state: "State",
    pitch: "Pitch",
    recordedBy: "Recorded by",
  },
  segment: {
    name: "Name",
    transcription: "Transcription",
    order: "Order",
    // A relation to the Speaker row (not a bare index): renaming a speaker in one
    // place flows through to every segment.
    speaker: "Speaker",
    text: "Text",
    startMs: "Start ms",
  },
  speaker: {
    name: "Name",
    transcription: "Transcription",
    speakerIndex: "Speaker index",
    // Free text the reviewer types — not a Notion Person (a PAT can't resolve people,
    // and the speaker is often someone outside the workspace anyway).
    person: "Person",
  },
  context: {
    name: "Name",
    pitch: "Pitch",
    // The living context lives in the Context page's BODY (markdown-ish blocks), not
    // a property — long prose renders better and isn't capped at a 2000-char chunk.
    updated: "Updated",
  },
} as const;

export class NotionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionUnavailableError";
  }
}

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";
const RICH_TEXT_LIMIT = 2000;

const token = (): string => {
  const value = process.env.NOTION_TOKEN;

  if (value == null || value === "") {
    throw new Error("NOTION_TOKEN is not configured");
  }

  return value;
};

const dbId = (name: string): string => {
  const value = process.env[name];

  if (value == null || value === "") {
    throw new Error(`${name} is not configured`);
  }

  return value;
};

// Object metadata carries the pitch page id dash-stripped (32 hex); the Notion API
// wants the canonical dashed UUID for relations.
const toUuid = (id: string): string =>
  /^[0-9a-f]{32}$/i.test(id)
    ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
    : id;

const request = async (method: string, path: string, body?: unknown): Promise<any> => {
  let res: Response;

  try {
    res = await fetch(`${NOTION_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        "Notion-Version": NOTION_VERSION,
        ...(body != null ? { "Content-Type": "application/json" } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new NotionUnavailableError(`Notion unreachable: ${error}`);
  }

  if (!res.ok) {
    throw new NotionUnavailableError(`Notion ${method} ${path} returned ${res.status}: ${await res.text()}`);
  }

  return res.json();
};

// Notion caps a single rich_text object at 2000 chars; long transcripts/contexts must
// be split across multiple objects (Notion concatenates them on display).
const richText = (text: string): unknown[] => {
  const chunks: unknown[] = [];

  for (let i = 0; i < text.length; i += RICH_TEXT_LIMIT) {
    chunks.push({ type: "text", text: { content: text.slice(i, i + RICH_TEXT_LIMIT) } });
  }

  return chunks.length > 0 ? chunks : [{ type: "text", text: { content: "" } }];
};

// Notion has no markdown-import on the REST API, so the living context is stored as a
// light mapping of lines → blocks (headings, bullets, paragraphs) and read back with the
// markers re-added — a good-enough round trip for prose the next Delivery re-summarizes.
const BLOCK_PREFIX: Record<string, string> = {
  heading_1: "# ",
  heading_2: "## ",
  heading_3: "### ",
  bulleted_list_item: "- ",
  paragraph: "",
};

const lineToBlock = (line: string): { type: string; content: string } => {
  if (line.startsWith("### ")) return { type: "heading_3", content: line.slice(4) };
  if (line.startsWith("## ")) return { type: "heading_2", content: line.slice(3) };
  if (line.startsWith("# ")) return { type: "heading_1", content: line.slice(2) };
  if (line.startsWith("- ") || line.startsWith("* ")) return { type: "bulleted_list_item", content: line.slice(2) };

  return { type: "paragraph", content: line };
};

const textToBlocks = (text: string): unknown[] =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const { type, content } = lineToBlock(line);

      return { object: "block", type, [type]: { rich_text: richText(content) } };
    });

const blockText = (block: any): string => {
  const prefix = BLOCK_PREFIX[block.type];
  const rich = block[block.type]?.rich_text;

  // Known kinds keep their markdown marker (round-trips our own Context bodies); any
  // other text-bearing block (numbered list, to_do, quote, callout, toggle) is read as
  // plain text so external pages like a pitch are still captured.
  if (prefix != null) {
    return prefix + plainText(rich);
  }

  return Array.isArray(rich) ? plainText(rich) : "";
};

const readPageBody = async (pageId: string): Promise<string> => {
  const lines: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await request(
      "GET",
      `/blocks/${pageId}/children?page_size=100${cursor != null ? `&start_cursor=${cursor}` : ""}`,
    );

    lines.push(...page.results.map(blockText).filter((line: string) => line !== ""));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor != null);

  return lines.join("\n");
};

const titleText = (properties: any): string => {
  const titleProp = Object.values(properties ?? {}).find((p: any) => p?.type === "title") as any;

  return plainText(titleProp?.title);
};

// The pitch's own page (title + body) — fed to context generation as background so the
// living context is grounded in what the pitch actually is.
export const getPitchContent = async (pitchId: string): Promise<string> => {
  const page = await request("GET", `/pages/${toUuid(pitchId)}`);
  const title = titleText(page.properties);
  const body = await readPageBody(toUuid(pitchId));

  return body.trim() !== "" ? `# ${title}\n${body}` : `# ${title}`;
};

// The living context is fully regenerated each Delivery, so the body is replaced: drop
// the existing blocks, then append the new ones (Notion caps appends at 100 per call).
const replacePageBody = async (pageId: string, blocks: unknown[]): Promise<void> => {
  const existing = await request("GET", `/blocks/${pageId}/children?page_size=100`);

  for (const block of existing.results) {
    await request("DELETE", `/blocks/${block.id}`);
  }

  for (let i = 0; i < blocks.length; i += 100) {
    await request("PATCH", `/blocks/${pageId}/children`, { children: blocks.slice(i, i + 100) });
  }
};

const queryAll = async (databaseId: string, filter?: unknown): Promise<any[]> => {
  const pages: any[] = [];
  let cursor: string | undefined;

  do {
    const page = await request("POST", `/databases/${databaseId}/query`, {
      ...(filter != null ? { filter } : {}),
      ...(cursor != null ? { start_cursor: cursor } : {}),
      page_size: 100,
    });

    pages.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor != null);

  return pages;
};

// Resolves the recorder's email to a Notion workspace person so `Recorded by` is a
// real Person, not free text. Requires the integration's "read user email" capability;
// returns null (handled by the caller) when the email maps to no workspace user.
export const resolvePersonByEmail = async (email: string): Promise<string | null> => {
  let cursor: string | undefined;

  do {
    const page = await request(
      "GET",
      `/users?page_size=100${cursor != null ? `&start_cursor=${cursor}` : ""}`,
    );

    const match = page.results.find(
      (user: any) => user.type === "person" && user.person?.email === email,
    );

    if (match != null) {
      return match.id;
    }

    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor != null);

  return null;
};

export const createTranscription = async (input: {
  title: string;
  pitchId: string;
  recordedByUserId: string | null;
  state: TranscriptionState;
}): Promise<string> => {
  const props = NOTION_PROPS.transcription;
  const created = await request("POST", "/pages", {
    parent: { database_id: dbId("NOTION_TRANSCRIPTIONS_DB") },
    properties: {
      [props.name]: { title: [{ type: "text", text: { content: input.title } }] },
      [props.state]: { select: { name: input.state } },
      [props.pitch]: { relation: [{ id: toUuid(input.pitchId) }] },
      ...(input.recordedByUserId != null
        ? { [props.recordedBy]: { people: [{ id: input.recordedByUserId }] } }
        : {}),
    },
  });

  return created.id;
};

export const addSegment = async (input: {
  transcriptionId: string;
  order: number;
  speakerId: string;
  text: string;
  startMs: number;
}): Promise<void> => {
  const props = NOTION_PROPS.segment;

  await request("POST", "/pages", {
    parent: { database_id: dbId("NOTION_SEGMENTS_DB") },
    properties: {
      [props.name]: { title: [{ type: "text", text: { content: `#${input.order}` } }] },
      [props.transcription]: { relation: [{ id: input.transcriptionId }] },
      [props.order]: { number: input.order },
      [props.speaker]: { relation: [{ id: input.speakerId }] },
      [props.text]: { rich_text: richText(input.text) },
      [props.startMs]: { number: input.startMs },
    },
  });
};

// Returns the created Speaker row id so segments can relate to it. Speakers are
// written before segments for that reason.
export const addSpeaker = async (input: {
  transcriptionId: string;
  speakerIndex: number;
}): Promise<string> => {
  const props = NOTION_PROPS.speaker;

  const created = await request("POST", "/pages", {
    parent: { database_id: dbId("NOTION_SPEAKERS_DB") },
    properties: {
      [props.name]: { title: [{ type: "text", text: { content: `Speaker ${input.speakerIndex}` } }] },
      [props.transcription]: { relation: [{ id: input.transcriptionId }] },
      [props.speakerIndex]: { number: input.speakerIndex },
    },
  });

  return created.id;
};

export const setTranscriptionState = async (
  transcriptionId: string,
  state: TranscriptionState,
): Promise<void> => {
  await request("PATCH", `/pages/${transcriptionId}`, {
    properties: { [NOTION_PROPS.transcription.state]: { select: { name: state } } },
  });
};

export interface AssignedTranscription {
  id: string;
  pitchId: string | null;
}

export const queryByState = async (state: TranscriptionState): Promise<AssignedTranscription[]> => {
  const rows = await queryAll(dbId("NOTION_TRANSCRIPTIONS_DB"), {
    property: NOTION_PROPS.transcription.state,
    select: { equals: state },
  });

  return rows.map((row) => ({
    id: row.id,
    pitchId: row.properties[NOTION_PROPS.transcription.pitch]?.relation?.[0]?.id ?? null,
  }));
};

const plainText = (richTextValue: any[]): string =>
  (richTextValue ?? []).map((chunk) => chunk.plain_text ?? "").join("");

// Rebuilds the named transcript from the Segments + Speakers: orders segments, maps
// each segment's Speaker relation to the reviewer-typed Person text (falling back to
// "Speaker N" when left blank), and renders "[Name]: text" lines.
export const buildNamedTranscript = async (transcriptionId: string): Promise<string> => {
  const segmentRows = await queryAll(dbId("NOTION_SEGMENTS_DB"), {
    property: NOTION_PROPS.segment.transcription,
    relation: { contains: transcriptionId },
  });
  const speakerRows = await queryAll(dbId("NOTION_SPEAKERS_DB"), {
    property: NOTION_PROPS.speaker.transcription,
    relation: { contains: transcriptionId },
  });

  const nameBySpeakerId = new Map<string, string>();

  for (const row of speakerRows) {
    const index = row.properties[NOTION_PROPS.speaker.speakerIndex]?.number;
    const person = plainText(row.properties[NOTION_PROPS.speaker.person]?.rich_text);

    nameBySpeakerId.set(row.id, person.trim() !== "" ? person : `Speaker ${index ?? "?"}`);
  }

  return segmentRows
    .map((row) => ({
      order: row.properties[NOTION_PROPS.segment.order]?.number ?? 0,
      speakerId: row.properties[NOTION_PROPS.segment.speaker]?.relation?.[0]?.id ?? null,
      text: plainText(row.properties[NOTION_PROPS.segment.text]?.rich_text),
    }))
    .sort((a, b) => a.order - b.order)
    .map((segment) => `[${(segment.speakerId != null ? nameBySpeakerId.get(segment.speakerId) : null) ?? "Speaker ?"}]: ${segment.text}`)
    .join("\n");
};

export const getContext = async (pitchId: string): Promise<{ id: string; text: string } | null> => {
  const rows = await queryAll(dbId("NOTION_CONTEXTS_DB"), {
    property: NOTION_PROPS.context.pitch,
    relation: { contains: toUuid(pitchId) },
  });

  if (rows.length === 0) {
    return null;
  }

  return { id: rows[0].id, text: await readPageBody(rows[0].id) };
};

// One Context row per pitch (the durable outcome). The living context is the page BODY:
// create the row with it on first delivery, replace the body in place thereafter; stamp
// Updated each time.
export const upsertContext = async (input: {
  pitchId: string;
  title: string;
  text: string;
  updatedIso: string;
}): Promise<void> => {
  const props = NOTION_PROPS.context;
  const existing = await getContext(input.pitchId);
  const blocks = textToBlocks(input.text);

  if (existing != null) {
    await replacePageBody(existing.id, blocks);
    await request("PATCH", `/pages/${existing.id}`, {
      properties: { [props.updated]: { date: { start: input.updatedIso } } },
    });
    return;
  }

  const created = await request("POST", "/pages", {
    parent: { database_id: dbId("NOTION_CONTEXTS_DB") },
    properties: {
      [props.name]: { title: [{ type: "text", text: { content: input.title } }] },
      [props.pitch]: { relation: [{ id: toUuid(input.pitchId) }] },
      [props.updated]: { date: { start: input.updatedIso } },
    },
    children: blocks.slice(0, 100),
  });

  for (let i = 100; i < blocks.length; i += 100) {
    await request("PATCH", `/blocks/${created.id}/children`, { children: blocks.slice(i, i + 100) });
  }
};
