# Agent Context Docs

Short, task-oriented guidance for AI coding agents. These docs are linked from root `AGENTS.md` and loaded on demand — not always in context.

## Principles

- Executable config and source code are authoritative. When a doc conflicts with `eslint.config.mjs`, `.prettierrc`, `tsconfig`, `nuxt.config.ts`, or `package.json` scripts, trust the config.
- Keep each file focused on one topic. Prefer links to source files over copying details that will drift.
- Update or remove obsolete guidance in the same change that makes it obsolete. Do not leave stale agent-context docs.

## Docs

| File                      | Topic                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| `style-and-validation.md` | Test stack, test invocation, styling details, TypeScript conventions |
