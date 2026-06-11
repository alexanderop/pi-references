import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { setupReferencesExtension } from "#src/extension/index.ts";
import type { ExtensionOptions } from "#src/extension/index.ts";

type Handler = (event: unknown, ctx: unknown) => Promise<unknown> | unknown;

interface CommandRegistration {
  description: string;
  handler: (args: string | undefined, ctx: unknown) => Promise<void> | void;
}

function createFakePi() {
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, CommandRegistration>();

  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand(name: string, registration: CommandRegistration) {
      commands.set(name, registration);
    },
  };

  const emit = async (event: string, payload: unknown, ctx: unknown): Promise<unknown> => {
    let lastResult: unknown;
    for (const handler of handlers.get(event) ?? []) {
      lastResult = await handler(payload, ctx);
    }
    return lastResult;
  };

  return { pi: pi as unknown as ExtensionAPI, emit, commands };
}

function createCtx(cwd: string) {
  return {
    cwd,
    hasUI: true,
    ui: { notify: vi.fn<(message: string, severity: string) => void>() },
    isProjectTrusted: () => true,
  };
}

let workDir: string;
let projectDir: string;
let homeDir: string;
let options: ExtensionOptions;

function writeConfig(value: unknown): void {
  const file = path.join(projectDir, ".pi", "references.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

const flushBackgroundWork = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-references-ext-"));
  projectDir = path.join(workDir, "project");
  homeDir = path.join(workDir, "home");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  options = {
    homeDir,
    ensureClone: vi.fn<ExtensionOptions["ensureClone"]>(async () => "cloned" as const),
    updateClone: vi.fn<ExtensionOptions["updateClone"]>(async () => {}),
  };
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("setupReferencesExtension", () => {
  it("appends described references to the system prompt", async () => {
    writeConfig({
      references: {
        docs: { path: "../docs", description: "Use for product docs" },
        quiet: { path: "../quiet" },
      },
    });
    const { pi, emit } = createFakePi();
    setupReferencesExtension(pi, options);
    const ctx = createCtx(projectDir);

    await emit("session_start", { reason: "startup" }, ctx);
    const result = (await emit(
      "before_agent_start",
      { prompt: "hi", systemPrompt: "BASE" },
      ctx,
    )) as { systemPrompt?: string };

    expect(result.systemPrompt).toContain("BASE");
    expect(result.systemPrompt).toContain("## Reference directories");
    expect(result.systemPrompt).toContain(path.join(projectDir, "docs"));
    expect(result.systemPrompt).not.toContain("quiet");
  });

  it("leaves the system prompt alone when nothing is advertised", async () => {
    const { pi, emit } = createFakePi();
    setupReferencesExtension(pi, options);
    const ctx = createCtx(projectDir);

    await emit("session_start", { reason: "startup" }, ctx);
    const result = await emit("before_agent_start", { prompt: "hi", systemPrompt: "BASE" }, ctx);

    expect(result).toBeUndefined();
  });

  it("materializes git references in the background after session start", async () => {
    writeConfig({ references: { effect: "Effect-TS/effect" } });
    const { pi, emit } = createFakePi();
    setupReferencesExtension(pi, options);

    await emit("session_start", { reason: "startup" }, createCtx(projectDir));
    await flushBackgroundWork();

    expect(options.ensureClone).toHaveBeenCalledWith({
      url: "https://github.com/Effect-TS/effect.git",
      branch: undefined,
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
    });
  });

  it("blocks write and edit tool calls inside git reference caches", async () => {
    writeConfig({ references: { effect: { repository: "Effect-TS/effect", description: "x" } } });
    const { pi, emit } = createFakePi();
    setupReferencesExtension(pi, options);
    const ctx = createCtx(projectDir);
    await emit("session_start", { reason: "startup" }, ctx);
    const cachedFile = path.join(
      homeDir,
      ".pi",
      "agent",
      "references",
      "github.com",
      "Effect-TS",
      "effect",
      "_default",
      "src",
      "x.ts",
    );

    const writeResult = await emit(
      "tool_call",
      { toolName: "write", toolCallId: "1", input: { path: cachedFile, content: "x" } },
      ctx,
    );
    const editResult = await emit(
      "tool_call",
      { toolName: "edit", toolCallId: "2", input: { path: cachedFile } },
      ctx,
    );
    const readResult = await emit(
      "tool_call",
      { toolName: "read", toolCallId: "3", input: { path: cachedFile } },
      ctx,
    );
    const elsewhereResult = await emit(
      "tool_call",
      {
        toolName: "write",
        toolCallId: "4",
        input: { path: path.join(projectDir, "src", "ok.ts"), content: "x" },
      },
      ctx,
    );

    expect(writeResult).toMatchObject({ block: true });
    expect(editResult).toMatchObject({ block: true });
    expect(readResult).toBeUndefined();
    expect(elsewhereResult).toBeUndefined();
  });

  it("notifies about config errors on session start", async () => {
    writeConfig({ references: { bad: { path: "./x", repository: "a/b" } } });
    const { pi, emit } = createFakePi();
    setupReferencesExtension(pi, options);
    const ctx = createCtx(projectDir);

    await emit("session_start", { reason: "startup" }, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("bad"), "error");
  });

  it("registers a /references command that lists references", async () => {
    writeConfig({ references: { docs: { path: "./docs", description: "Docs" } } });
    const { pi, emit, commands } = createFakePi();
    setupReferencesExtension(pi, options);
    const ctx = createCtx(projectDir);
    await emit("session_start", { reason: "startup" }, ctx);

    await commands.get("references")?.handler(undefined, ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("docs"), "info");
  });

  it("updates existing git caches via /references update", async () => {
    writeConfig({ references: { effect: "Effect-TS/effect" } });
    const cacheDir = path.join(
      homeDir,
      ".pi",
      "agent",
      "references",
      "github.com",
      "Effect-TS",
      "effect",
      "_default",
    );
    fs.mkdirSync(path.join(cacheDir, ".git"), { recursive: true });
    const { pi, emit, commands } = createFakePi();
    setupReferencesExtension(pi, options);
    const ctx = createCtx(projectDir);
    await emit("session_start", { reason: "startup" }, ctx);

    await commands.get("references")?.handler("update", ctx);

    expect(options.updateClone).toHaveBeenCalledWith(cacheDir);
  });
});
