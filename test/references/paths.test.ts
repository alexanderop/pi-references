import { describe, expect, it } from "vitest";
import { isPathInside } from "#src/references/paths.ts";

describe("isPathInside", () => {
  it("accepts a file inside the directory", () => {
    expect(isPathInside("/cache/repo/file.ts", "/cache/repo")).toBe(true);
  });

  it("accepts nested files", () => {
    expect(isPathInside("/cache/repo/a/b/c.ts", "/cache/repo")).toBe(true);
  });

  it("rejects siblings that share a prefix", () => {
    expect(isPathInside("/cache/repo-other/file.ts", "/cache/repo")).toBe(false);
  });

  it("rejects paths that escape via dot segments", () => {
    expect(isPathInside("/cache/repo/../outside.ts", "/cache/repo")).toBe(false);
  });

  it("rejects unrelated paths", () => {
    expect(isPathInside("/elsewhere/file.ts", "/cache/repo")).toBe(false);
  });

  it("accepts the directory itself", () => {
    expect(isPathInside("/cache/repo", "/cache/repo")).toBe(true);
  });
});
