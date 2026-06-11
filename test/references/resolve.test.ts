import { describe, expect, it } from "vitest";
import { gitCacheDir, parseRepository, resolveLocalPath } from "#src/references/resolve.ts";

describe("resolveLocalPath", () => {
  it("resolves relative paths against the config directory", () => {
    expect(resolveLocalPath("../docs", "/repo/.pi", "/home/u")).toBe("/repo/docs");
  });

  it("keeps absolute paths", () => {
    expect(resolveLocalPath("/srv/docs", "/repo/.pi", "/home/u")).toBe("/srv/docs");
  });

  it("expands the home prefix", () => {
    expect(resolveLocalPath("~/docs", "/repo/.pi", "/home/u")).toBe("/home/u/docs");
  });
});

describe("parseRepository", () => {
  it("expands GitHub owner/repo shorthand", () => {
    expect(parseRepository("Effect-TS/effect")).toEqual({
      url: "https://github.com/Effect-TS/effect.git",
      host: "github.com",
      repoPath: "Effect-TS/effect",
    });
  });

  it("expands host/path references", () => {
    expect(parseRepository("gitlab.com/group/sub/project")).toEqual({
      url: "https://gitlab.com/group/sub/project.git",
      host: "gitlab.com",
      repoPath: "group/sub/project",
    });
  });

  it("passes through https URLs", () => {
    expect(parseRepository("https://github.com/user/repo.git")).toEqual({
      url: "https://github.com/user/repo.git",
      host: "github.com",
      repoPath: "user/repo",
    });
  });

  it("passes through ssh scp-style URLs", () => {
    expect(parseRepository("git@github.com:user/repo.git")).toEqual({
      url: "git@github.com:user/repo.git",
      host: "github.com",
      repoPath: "user/repo",
    });
  });

  it("returns undefined for values it cannot parse", () => {
    expect(parseRepository("not-a-repo")).toBeUndefined();
    expect(parseRepository("")).toBeUndefined();
  });
});

describe("gitCacheDir", () => {
  it("nests host, repo path, and branch under the cache root", () => {
    const remote = { url: "x", host: "github.com", repoPath: "user/repo" };

    expect(gitCacheDir(remote, "main", "/cache")).toBe("/cache/github.com/user/repo/main");
  });

  it("uses a default segment when no branch is set", () => {
    const remote = { url: "x", host: "github.com", repoPath: "user/repo" };

    expect(gitCacheDir(remote, undefined, "/cache")).toBe("/cache/github.com/user/repo/_default");
  });

  it("sanitizes branch names so they cannot escape the cache root", () => {
    const remote = { url: "x", host: "github.com", repoPath: "user/repo" };

    const dir = gitCacheDir(remote, "../../evil", "/cache");

    expect(dir.startsWith("/cache/github.com/user/repo/")).toBe(true);
    expect(dir).not.toContain("..");
  });

  it("sanitizes slashes in branch names", () => {
    const remote = { url: "x", host: "github.com", repoPath: "user/repo" };

    expect(gitCacheDir(remote, "feature/foo", "/cache")).toBe(
      "/cache/github.com/user/repo/feature-foo",
    );
  });
});
