import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureClone, updateClone } from "#src/extension/git-cache.ts";

let workDir: string;
let originDir: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function commitFile(repo: string, name: string, content: string): void {
  fs.writeFileSync(path.join(repo, name), content);
  git(repo, "add", name);
  git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", `add ${name}`);
}

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-references-"));
  originDir = path.join(workDir, "origin");
  fs.mkdirSync(originDir);
  git(originDir, "init", "-b", "main");
  commitFile(originDir, "readme.md", "v1");
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("ensureClone", () => {
  it("clones the repository into the target directory", async () => {
    const dir = path.join(workDir, "clone-default");

    const result = await ensureClone({ url: originDir, branch: undefined, dir });

    expect(result).toBe("cloned");
    expect(fs.readFileSync(path.join(dir, "readme.md"), "utf8")).toBe("v1");
  });

  it("is a no-op when the clone already exists", async () => {
    const dir = path.join(workDir, "clone-existing");
    await ensureClone({ url: originDir, branch: undefined, dir });

    const result = await ensureClone({ url: originDir, branch: undefined, dir });

    expect(result).toBe("exists");
  });

  it("clones a specific branch", async () => {
    git(originDir, "checkout", "-b", "feature");
    commitFile(originDir, "feature.md", "feature content");
    git(originDir, "checkout", "main");
    const dir = path.join(workDir, "clone-branch");

    await ensureClone({ url: originDir, branch: "feature", dir });

    expect(fs.existsSync(path.join(dir, "feature.md"))).toBe(true);
  });

  it("rejects when the repository cannot be cloned", async () => {
    const dir = path.join(workDir, "clone-bad");

    await expect(
      ensureClone({ url: path.join(workDir, "does-not-exist"), branch: undefined, dir }),
    ).rejects.toThrow(/Command failed/);
  });
});

describe("updateClone", () => {
  it("fast-forwards an existing clone to the remote state", async () => {
    const dir = path.join(workDir, "clone-update");
    await ensureClone({ url: originDir, branch: "main", dir });
    commitFile(originDir, "second.md", "v2");

    await updateClone(dir);

    expect(fs.existsSync(path.join(dir, "second.md"))).toBe(true);
  });

  it("discards local drift in the cache", async () => {
    const dir = path.join(workDir, "clone-drift");
    await ensureClone({ url: originDir, branch: "main", dir });
    fs.writeFileSync(path.join(dir, "readme.md"), "local tampering");

    await updateClone(dir);

    expect(fs.readFileSync(path.join(dir, "readme.md"), "utf8")).toBe("v1");
  });
});
