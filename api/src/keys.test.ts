import { describe, expect, it } from "vitest";

import { renderKey, sanitizeSegment } from "./keys";
import { PROFILES } from "./profiles";

describe("sanitizeSegment", () => {
  it("keeps safe characters", () => {
    expect(sanitizeSegment("abc-DEF_123.webm")).toBe("abc-DEF_123.webm");
  });

  it("flattens path traversal attempts", () => {
    expect(sanitizeSegment("../../etc/passwd")).not.toContain("..");
    expect(sanitizeSegment("../../etc/passwd")).not.toContain("/");
  });

  it("strips leading and trailing separators", () => {
    expect(sanitizeSegment("/leading")).toBe("leading");
    expect(sanitizeSegment("...dots...")).toBe("dots");
  });

  it("falls back when nothing survives", () => {
    expect(sanitizeSegment("///")).toBe("unknown");
  });
});

describe("renderKey", () => {
  it("renders the orientation template", () => {
    const key = renderKey(PROFILES.orientation, {
      meetSlug: "abc-defg-hij",
      timestamp: "20260603T150200Z",
    }, {});

    expect(key).toBe("orientation/abc-defg-hij/20260603T150200Z.webm");
  });

  it("mixes auto and user fields for projects", () => {
    const key = renderKey(
      PROFILES.project,
      { userId: "user@filadd.com", timestamp: "20260603T150200Z" },
      { projectId: "proj 42" },
    );

    expect(key).toBe("projects/proj-42/user-filadd.com/20260603T150200Z.webm");
  });

  it("prefers auto values over client fields on collision", () => {
    const key = renderKey(
      PROFILES.orientation,
      { meetSlug: "abc-defg-hij", timestamp: "t1" },
      { meetSlug: "evil" },
    );

    expect(key).toContain("abc-defg-hij");
    expect(key).not.toContain("evil");
  });

  it("throws on missing placeholder values", () => {
    expect(() => renderKey(PROFILES.orientation, { meetSlug: "abc" }, {})).toThrow(
      /\{timestamp\}/,
    );
  });

  it("neutralizes traversal in values", () => {
    const key = renderKey(
      PROFILES.project,
      { userId: "../..", timestamp: "t" },
      { projectId: "../../other" },
    );

    expect(key.split("/").every((segment) => segment !== ".." && segment !== "")).toBe(true);
  });
});
