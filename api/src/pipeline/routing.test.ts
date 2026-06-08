import { describe, expect, it } from "vitest";

import { profileForKey } from "./routing";

describe("profileForKey", () => {
  it("routes a projects/ key to the project profile", () => {
    expect(profileForKey("projects/20260607T150200Z-uuid.webm")).toBe("project");
  });

  it("returns null for an unknown prefix", () => {
    expect(profileForKey("orientation/20260607T150200Z-12345.webm")).toBeNull();
    expect(profileForKey("random/file.webm")).toBeNull();
  });
});
