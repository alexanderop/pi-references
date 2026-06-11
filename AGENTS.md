# pi-references

A shareable pi extension that adds OpenCode-style **references**: local directories and Git repositories configured by alias, made available to the agent as context. See README.md for user-facing docs.

## Commands

- `pnpm verify` — typecheck + lint + format check + tests (run before committing)
- `pnpm test` — vitest only
- `pnpm run pi` — run pi with only this extension loaded

## Architecture

- `src/references/` — pure domain core (config parsing, resolution, prompt building). Must stay Pi-SDK-free; the dependency direction extension -> references is enforced by oxlint `no-restricted-imports`.
- `src/extension/` — pi adapter layer: `index.ts` (event wiring, injectable via `setupReferencesExtension`), `load-references.ts` (config files), `git-cache.ts` (clone/update).
- Use `#src/*` subpath imports inside `src/` and `test/`; no relative parent imports.

## Reference repositories

Source-of-truth code for libraries we depend on. Treat as **read-only reference material** — do not edit files under `repos/`. When asked about a library listed below, explore its source here first instead of guessing or relying on training data.

- `repos/pi/` — https://github.com/earendil-works/pi.git @ main (squashed)
