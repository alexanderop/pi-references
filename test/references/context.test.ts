import { describe, expect, it } from "vitest";
import { buildReferencesPrompt } from "#src/references/context.ts";
import type { ResolvedReference } from "#src/references/context.ts";

const local = (overrides: Partial<ResolvedReference> = {}): ResolvedReference => ({
  alias: "docs",
  kind: "local",
  dir: "/repo/docs",
  description: "Use for product docs",
  hidden: false,
  state: "ready",
  ...overrides,
});

describe("buildReferencesPrompt", () => {
  it("lists alias, resolved directory, and description", () => {
    const prompt = buildReferencesPrompt([local()]);

    expect(prompt).toContain("## Reference directories");
    expect(prompt).toContain("docs");
    expect(prompt).toContain("/repo/docs");
    expect(prompt).toContain("Use for product docs");
  });

  it("omits references without a description", () => {
    const prompt = buildReferencesPrompt([
      local(),
      local({ alias: "silent", dir: "/repo/silent", description: undefined }),
    ]);

    expect(prompt).not.toContain("silent");
  });

  it("still advertises hidden references that have a description", () => {
    const prompt = buildReferencesPrompt([local({ alias: "internal", hidden: true })]);

    expect(prompt).toContain("internal");
  });

  it("returns undefined when no reference has a description", () => {
    expect(buildReferencesPrompt([local({ description: undefined })])).toBeUndefined();
    expect(buildReferencesPrompt([])).toBeUndefined();
  });

  it("marks git references that are still materializing", () => {
    const prompt = buildReferencesPrompt([local({ alias: "sdk", kind: "git", state: "pending" })]);

    expect(prompt).toContain("still being cloned");
  });
});
