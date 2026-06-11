import { describe, expect, it } from "vitest";
import { mergeReferences, parseReferencesConfig } from "#src/references/config.ts";

describe("parseReferencesConfig", () => {
  it("parses a local path entry", () => {
    const result = parseReferencesConfig({
      references: {
        docs: { path: "../product-docs", description: "Use for product docs" },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.references).toEqual([
      {
        kind: "local",
        alias: "docs",
        path: "../product-docs",
        description: "Use for product docs",
        hidden: false,
      },
    ]);
  });

  it("parses a git repository entry with branch", () => {
    const result = parseReferencesConfig({
      references: {
        sdk: { repository: "anomalyco/opencode-sdk-js", branch: "main", description: "SDK" },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.references).toEqual([
      {
        kind: "git",
        alias: "sdk",
        repository: "anomalyco/opencode-sdk-js",
        branch: "main",
        description: "SDK",
        hidden: false,
      },
    ]);
  });

  it("treats string shorthand starting with a path prefix as local", () => {
    const result = parseReferencesConfig({
      references: {
        docs: "../docs",
        home: "~/docs",
        abs: "/srv/docs",
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.references.map((r) => r.kind)).toEqual(["local", "local", "local"]);
  });

  it("treats other string shorthand as a git repository", () => {
    const result = parseReferencesConfig({
      references: {
        effect: "Effect-TS/effect",
      },
    });

    expect(result.references).toEqual([
      { kind: "git", alias: "effect", repository: "Effect-TS/effect", hidden: false },
    ]);
  });

  it("keeps the hidden flag", () => {
    const result = parseReferencesConfig({
      references: {
        internal: { path: "../internal", hidden: true },
      },
    });

    expect(result.references[0]?.hidden).toBe(true);
  });

  it("rejects aliases with slashes, whitespace, backticks, or commas", () => {
    const result = parseReferencesConfig({
      references: {
        "a/b": "../x",
        "a b": "../x",
        "a`b": "../x",
        "a,b": "../x",
      },
    });

    expect(result.references).toEqual([]);
    expect(result.errors).toHaveLength(4);
  });

  it("rejects entries with both path and repository", () => {
    const result = parseReferencesConfig({
      references: {
        bad: { path: "../x", repository: "a/b" },
      },
    });

    expect(result.references).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("rejects entries with neither path nor repository", () => {
    const result = parseReferencesConfig({
      references: { bad: { description: "nothing here" } },
    });

    expect(result.references).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("rejects branch on a local path entry", () => {
    const result = parseReferencesConfig({
      references: { bad: { path: "../x", branch: "main" } },
    });

    expect(result.references).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("reports an error when the references key is missing", () => {
    const result = parseReferencesConfig({});

    expect(result.references).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  it("collects errors per alias and keeps valid entries", () => {
    const result = parseReferencesConfig({
      references: {
        good: "../docs",
        bad: 42,
      },
    });

    expect(result.references.map((r) => r.alias)).toEqual(["good"]);
    expect(result.errors).toHaveLength(1);
  });
});

describe("mergeReferences", () => {
  it("lets project entries win over global entries with the same alias", () => {
    const merged = mergeReferences(
      [
        { kind: "local", alias: "docs", path: "/global/docs", hidden: false },
        { kind: "local", alias: "shared", path: "/global/shared", hidden: false },
      ],
      [{ kind: "local", alias: "docs", path: "/project/docs", hidden: false }],
    );

    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.alias === "docs")).toMatchObject({ path: "/project/docs" });
    expect(merged.find((r) => r.alias === "shared")).toMatchObject({ path: "/global/shared" });
  });
});
