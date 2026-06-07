import { describe, expect, it } from "vitest";

import { extractNotionPageId } from "./notion";

const ID = "667c67371f6544719c3c50258bdbfe65";

describe("extractNotionPageId", () => {
  it("parses classic notion.so page URLs", () => {
    expect(extractNotionPageId(`https://www.notion.so/filadd/My-Pitch-${ID}`)).toBe(ID);
  });

  it("parses app.notion.com short URLs", () => {
    expect(extractNotionPageId(`https://app.notion.com/p/filadd/${ID}`)).toBe(ID);
  });

  it("normalizes dashed page ids", () => {
    expect(
      extractNotionPageId("https://www.notion.so/667c6737-1f65-4471-9c3c-50258bdbfe65"),
    ).toBe(ID);
  });

  it("ignores view ids in query params", () => {
    expect(
      extractNotionPageId(
        `https://app.notion.com/p/filadd/${ID}?v=cfa02eb1375c467abb81fd6f59e1d414`,
      ),
    ).toBe(ID);
  });

  it("rejects URLs without a page id", () => {
    expect(extractNotionPageId("https://www.notion.so/filadd")).toBeNull();
  });

  it("rejects values that are not URLs", () => {
    expect(extractNotionPageId("not a url")).toBeNull();
    expect(extractNotionPageId(ID)).toBeNull();
  });
});
