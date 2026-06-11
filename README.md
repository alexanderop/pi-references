# pi-references

A [pi](https://pi.dev) extension that adds [OpenCode-style references](https://opencode.ai/docs/references/): local directories and Git repositories configured by alias and made available to the agent as context.

References give pi access to directories outside the current project. Use them to make documentation, shared libraries, examples, or another repository available while you work — the agent reads real source instead of guessing from training data.

## Install

```bash
# From git (shareable)
pi install git:github.com/alexanderop/pi-references

# Or from a local checkout
pi install /path/to/pi-references

# Try it without installing
pi -e /path/to/pi-references
```

## Configure

References are configured by alias in `.pi/references.json` (project-local, requires project trust) or `~/.pi/agent/references.json` (global). When the same alias exists in both, the project entry wins.

```json
{
  "references": {
    "docs": {
      "path": "../product-docs",
      "description": "Use for product behavior and documentation conventions"
    },
    "sdk": {
      "repository": "anomalyco/opencode-sdk-js",
      "branch": "main",
      "description": "Use for JavaScript SDK implementation details"
    }
  }
}
```

### Local directories

Use `path` to reference a local directory. Paths can be:

- Relative to the config file that defines the reference (`"../docs"`)
- Absolute (`"/home/user/docs"`)
- Relative to your home directory (`"~/docs"`)

String shorthand works when you don't need other fields: `"docs": "../docs"`.

### Git repositories

Use `repository` to reference a Git repository. The repository is cloned (shallow, single branch) into a local cache at `~/.pi/agent/references/<host>/<path>/<branch>` and the checkout is made available as a reference directory.

`repository` accepts Git URLs, `host/path` references, and GitHub `owner/repo` shorthand. The optional `branch` field selects a branch; without it, the repository's default branch is used.

String shorthand: `"effect": "Effect-TS/effect"`.

Clones happen asynchronously after session start — a newly configured repository may take a moment to materialize. Refs are refreshed only when you run `/references update`.

### Describe usage

Add `description` to explain when the agent should use a reference. References **with** descriptions are advertised in the agent's system prompt (alias, resolved path, and description). References **without** descriptions stay usable but are not advertised.

### Fields

| Field         | Local | Git | Description                                       |
| ------------- | ----- | --- | ------------------------------------------------- |
| `path`        | Yes   | No  | Local reference directory                         |
| `repository`  | No    | Yes | Git URL, `host/path`, or `owner/repo` value       |
| `branch`      | No    | Yes | Optional Git branch or ref                        |
| `description` | Yes   | Yes | Guidance describing when to use the reference     |
| `hidden`      | Yes   | Yes | Accepted for OpenCode config compatibility        |

Reference aliases cannot be empty or contain `/`, whitespace, backticks, or commas.

## Use

- The agent sees described references in its system prompt and reads files from them when relevant.
- `/references` lists all configured references with their kind, state, and resolved directory.
- `/references update` fetches and hard-resets all materialized git caches to the remote state.
- `write`/`edit` tool calls into a git reference cache are blocked — caches are read-only; edit the upstream repository instead.

## Development

```bash
pnpm install
pnpm verify        # typecheck + lint + format check + tests
pnpm test          # vitest
pnpm run pi        # run pi with only this extension loaded
```

Layout:

- `src/references/` — pure domain core (config parsing, path/repository resolution, prompt building). Pi-SDK-free, enforced by lint.
- `src/extension/` — pi adapter: event wiring, git cache, config-file loading.
- `repos/pi/` — vendored pi source (git subtree) as read-only reference material.

## License

MIT
