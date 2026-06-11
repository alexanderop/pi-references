import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ensureClone, updateClone } from "#src/extension/git-cache.ts";
import type { CloneTarget, EnsureCloneResult } from "#src/extension/git-cache.ts";
import { loadReferences } from "#src/extension/load-references.ts";
import type { LoadedReference } from "#src/extension/load-references.ts";
import { buildReferencesPrompt } from "#src/references/context.ts";
import { isPathInside } from "#src/references/paths.ts";

export interface ExtensionOptions {
  homeDir: string;
  ensureClone: (target: CloneTarget) => Promise<EnsureCloneResult>;
  updateClone: (dir: string) => Promise<void>;
}

function notify(ctx: ExtensionContext, message: string, severity: "info" | "error"): void {
  if (ctx.hasUI) ctx.ui.notify(message, severity);
}

export function setupReferencesExtension(pi: ExtensionAPI, options: ExtensionOptions): void {
  let references: LoadedReference[] = [];

  async function materialize(ctx: ExtensionContext): Promise<void> {
    for (const ref of references) {
      if (ref.kind !== "git" || ref.git === undefined || ref.state !== "pending") continue;
      try {
        await options.ensureClone({ url: ref.git.url, branch: ref.git.branch, dir: ref.dir });
        ref.state = "ready";
      } catch (error) {
        ref.state = "error";
        const message = error instanceof Error ? error.message : String(error);
        notify(ctx, `references: failed to clone "${ref.alias}": ${message}`, "error");
      }
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    // pi < 0.79 has no ctx.isProjectTrusted(); those versions have no granular
    // trust API at all, so fall back to trusting the project like they do.
    const projectTrusted =
      typeof ctx.isProjectTrusted === "function" ? ctx.isProjectTrusted() : true;
    const result = loadReferences({
      cwd: ctx.cwd,
      homeDir: options.homeDir,
      projectTrusted,
    });
    references = result.references;
    for (const error of result.errors) {
      notify(ctx, `references: ${error}`, "error");
    }
    void materialize(ctx);
  });

  pi.on("before_agent_start", async (event) => {
    const section = buildReferencesPrompt(references);
    if (section === undefined) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${section}` };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    const input = event.input as { path?: unknown };
    if (typeof input.path !== "string") return;
    const target = path.resolve(ctx.cwd, input.path);
    const hit = references.find((ref) => ref.kind === "git" && isPathInside(target, ref.dir));
    if (hit === undefined) return;
    return {
      block: true,
      reason: `${input.path} is inside the read-only reference "${hit.alias}" (git cache). Edit the upstream repository instead.`,
    };
  });

  pi.registerCommand("references", {
    description: "List configured references; use '/references update' to refresh git caches",
    handler: async (args, ctx) => {
      if (args?.trim() === "update") {
        let updated = 0;
        for (const ref of references) {
          if (ref.kind !== "git" || ref.state !== "ready") continue;
          try {
            await options.updateClone(ref.dir);
            updated += 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            notify(ctx, `references: failed to update "${ref.alias}": ${message}`, "error");
          }
        }
        notify(ctx, `references: updated ${updated} git cache(s)`, "info");
        return;
      }

      if (references.length === 0) {
        notify(
          ctx,
          "references: none configured. Add .pi/references.json or ~/.pi/agent/references.json",
          "info",
        );
        return;
      }

      const lines = references.map((ref) => {
        const detail = ref.description === undefined ? "" : ` — ${ref.description}`;
        return `${ref.alias} [${ref.kind}, ${ref.state}] ${ref.dir}${detail}`;
      });
      notify(ctx, lines.join("\n"), "info");
    },
  });
}

export default function referencesExtension(pi: ExtensionAPI): void {
  setupReferencesExtension(pi, { homeDir: os.homedir(), ensureClone, updateClone });
}
