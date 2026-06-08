import { describe, expect, it } from "vitest";

import { buildObjectMetadata, renderKey, sanitizeSegment } from "./keys";
import { PROFILES } from "./profiles";

const PITCH_ID = "667c67371f6544719c3c50258bdbfe65";

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
  it("renders the project template from auto fields only", () => {
    const key = renderKey(
      PROFILES.project,
      {
        meetSlug: "no-meet",
        timestamp: "20260607T150200Z",
        userId: "ana@filadd.com",
        uuid: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
      },
      { pitchId: PITCH_ID },
    );

    expect(key).toBe("projects/20260607T150200Z-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.webm");
  });

  it("prefers auto values over client fields on collision", () => {
    const key = renderKey(
      PROFILES.project,
      { meetSlug: "abc", timestamp: "t1", userId: "u", uuid: "u1" },
      { pitchId: PITCH_ID, timestamp: "evil" },
    );

    expect(key).toContain("t1");
    expect(key).not.toContain("evil");
  });

  it("throws on missing placeholder values", () => {
    expect(() => renderKey(PROFILES.project, { meetSlug: "abc" }, {})).toThrow(/\{timestamp\}/);
  });

  it("neutralizes traversal in values", () => {
    const key = renderKey(
      PROFILES.project,
      { meetSlug: "abc", timestamp: "t", userId: "u", uuid: "../../12345" },
      { pitchId: PITCH_ID },
    );

    expect(key.split("/").every((segment) => segment !== ".." && segment !== "")).toBe(true);
  });
});

describe("buildObjectMetadata", () => {
  const auto = {
    meetSlug: "abc-defg-hij",
    timestamp: "20260607T150200Z",
    userId: "ana@filadd.com",
  };

  it("maps contract fields to their snake_case pipeline keys", () => {
    const metadata = buildObjectMetadata(PROFILES.project, auto, {
      pitchId: PITCH_ID,
    });

    expect(metadata).toEqual({
      meet_slug: "abc-defg-hij",
      started_at: "20260607T150200Z",
      recorded_by: "ana@filadd.com",
      pitch_id: PITCH_ID,
    });
  });

  it("drops values outside the contract", () => {
    const metadata = buildObjectMetadata(
      PROFILES.project,
      { ...auto, uuid: "0f1e2d3c" },
      { pitchId: PITCH_ID, extra: "nope" },
    );

    expect(metadata).not.toHaveProperty("uuid");
    expect(metadata).not.toHaveProperty("extra");
  });

  it("folds diacritics and strips non-ASCII", () => {
    const metadata = buildObjectMetadata(PROFILES.project, { ...auto, userId: "José Pérez" }, {
      pitchId: PITCH_ID,
    });

    expect(metadata?.recorded_by).toBe("Jose Perez");
  });

  it("truncates each value to 256 characters", () => {
    const metadata = buildObjectMetadata(PROFILES.project, { ...auto, userId: "x".repeat(1000) }, {
      pitchId: PITCH_ID,
    });

    expect(metadata?.recorded_by).toHaveLength(256);
  });

  it("enforces the 2KB aggregate cap", () => {
    const longAuto = {
      meetSlug: "m".repeat(300),
      timestamp: "t".repeat(300),
      userId: "u".repeat(2000),
    };

    const metadata = buildObjectMetadata(PROFILES.project, longAuto, { pitchId: PITCH_ID });
    const total = Object.entries(metadata ?? {}).reduce(
      (sum, [key, value]) => sum + key.length + value.length,
      0,
    );

    expect(total).toBeLessThanOrEqual(2048);
  });

  it("returns undefined when the profile opts out", () => {
    const profile = { ...PROFILES.project, attachAsObjectMetadata: false };

    expect(buildObjectMetadata(profile, auto, { pitchId: PITCH_ID })).toBeUndefined();
  });
});
