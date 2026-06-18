import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildNamedTranscript, resolvePersonByEmail } from "./notion-client";

const json = (body: unknown): Response => ({ ok: true, status: 200, json: async () => body }) as Response;

// A page row whose Order/Speaker(relation)/Text/Person(text) properties mimic Notion's
// shapes. A segment points at its Speaker row by id (`spk-<index>`).
const segmentRow = (order: number, speaker: number, text: string) => ({
  id: `seg-${order}`,
  properties: {
    Order: { number: order },
    Speaker: { relation: [{ id: `spk-${speaker}` }] },
    Text: { rich_text: [{ plain_text: text }] },
  },
});

const speakerRow = (index: number, name: string | null) => ({
  id: `spk-${index}`,
  properties: {
    "Speaker index": { number: index },
    Person: { rich_text: name != null ? [{ plain_text: name }] : [] },
  },
});

describe("notion-client", () => {
  beforeEach(() => {
    process.env.NOTION_TOKEN = "secret";
    process.env.NOTION_SEGMENTS_DB = "seg-db";
    process.env.NOTION_SPEAKERS_DB = "spk-db";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rebuilds an ordered, speaker-named transcript", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("seg-db")
        ? json({ results: [segmentRow(2, 1, "world"), segmentRow(1, 0, "hello")], has_more: false })
        : json({ results: [speakerRow(0, "Ada"), speakerRow(1, "Linus")], has_more: false }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(buildNamedTranscript("t1")).resolves.toBe("[Ada]: hello\n[Linus]: world");
  });

  it("falls back to 'Speaker N' for unassigned speakers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("seg-db")
          ? json({ results: [segmentRow(1, 3, "hi")], has_more: false })
          : json({ results: [speakerRow(3, null)], has_more: false }),
      ),
    );

    await expect(buildNamedTranscript("t1")).resolves.toBe("[Speaker 3]: hi");
  });

  it("matches a person by email across paginated user lists", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ results: [{ id: "u1", type: "person", person: { email: "a@filadd.com" } }], has_more: true, next_cursor: "c1" }),
        )
        .mockResolvedValueOnce(
          json({ results: [{ id: "u2", type: "person", person: { email: "b@filadd.com" } }], has_more: false }),
        ),
    );

    await expect(resolvePersonByEmail("b@filadd.com")).resolves.toBe("u2");
  });

  it("returns null when no workspace user has the email", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [], has_more: false })));

    await expect(resolvePersonByEmail("nobody@filadd.com")).resolves.toBeNull();
  });
});
