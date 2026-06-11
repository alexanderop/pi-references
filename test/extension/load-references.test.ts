import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadReferences } from "#src/extension/load-references.ts";

let workDir: string;
let projectDir: string;
let homeDir: string;

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-references-load-"));
  projectDir = path.join(workDir, "project");
  homeDir = path.join(workDir, "home");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("loadReferences", () => {
  it("returns no references when no config file exists", () => {
    const result = loadReferences({ cwd: projectDir, homeDir, projectTrusted: true });

    expect(result.references).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("loads project references and resolves paths relative to the config file", () => {
    writeJson(path.join(projectDir, ".pi", "references.json"), {
      references: { docs: { path: "../docs", description: "project docs" } },
    });

    const result = loadReferences({ cwd: projectDir, homeDir, projectTrusted: true });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      alias: "docs",
      kind: "local",
      dir: path.join(projectDir, "docs"),
      state: "ready",
    });
  });

  it("merges global and project references with project winning", () => {
    writeJson(path.join(homeDir, ".pi", "agent", "references.json"), {
      references: {
        shared: { path: "~/shared", description: "global shared" },
        docs: { path: "~/docs", description: "global docs" },
      },
    });
    writeJson(path.join(projectDir, ".pi", "references.json"), {
      references: { docs: { path: "./docs", description: "project docs" } },
    });

    const result = loadReferences({ cwd: projectDir, homeDir, projectTrusted: true });

    const docs = result.references.find((r) => r.alias === "docs");
    expect(docs?.description).toBe("project docs");
    const shared = result.references.find((r) => r.alias === "shared");
    expect(shared?.dir).toBe(path.join(homeDir, "shared"));
  });

  it("ignores project config when the project is not trusted", () => {
    writeJson(path.join(projectDir, ".pi", "references.json"), {
      references: { docs: { path: "./docs" } },
    });

    const result = loadReferences({ cwd: projectDir, homeDir, projectTrusted: false });

    expect(result.references).toEqual([]);
  });

  it("maps git references to a cache directory under the pi agent home", () => {
    writeJson(path.join(projectDir, ".pi", "references.json"), {
      references: { effect: "Effect-TS/effect" },
    });

    const result = loadReferences({ cwd: projectDir, homeDir, projectTrusted: true });

    expect(result.references[0]).toMatchObject({
      alias: "effect",
      kind: "git",
      dir: path.join(
        homeDir,
        ".pi",
        "agent",
        "references",
        "github.com",
        "Effect-TS",
        "effect",
        "_default",
      ),
      state: "pending",
    });
    expect(result.references[0]?.git).toMatchObject({
      url: "https://github.com/Effect-TS/effect.git",
      branch: undefined,
    });
  });

  it("reports invalid JSON as an error instead of throwing", () => {
    const file = path.join(projectDir, ".pi", "references.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");

    const result = loadReferences({ cwd: projectDir, homeDir, projectTrusted: true });

    expect(result.references).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("reports unparseable repository values as errors", () => {
    writeJson(path.join(projectDir, ".pi", "references.json"), {
      references: { weird: { repository: "not-a-repo" } },
    });

    const result = loadReferences({ cwd: projectDir, homeDir, projectTrusted: true });

    expect(result.references).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });
});
