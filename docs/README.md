# TarkovTracker Documentation

Start here to find the right document. This folder holds technical and process documentation. The
canonical agent contract and project conventions live in the root [`AGENTS.md`](../AGENTS.md).

## Which doc do I need?

| I want to…                                        | Read                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Understand the project and get it running         | [`/README.md`](../README.md)                                       |
| Contribute (issues, branches, PRs, labels)        | [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md)            |
| Understand the architecture and data flow         | [`ARCHITECTURE.md`](./ARCHITECTURE.md)                             |
| Use or extend the HTTP/API surface                | [`API.md`](./API.md)                                               |
| Deploy, configure env vars, or handle an incident | [`runbook.md`](./runbook.md)                                       |
| Understand CI/CD, hooks, and releases             | [`WORKFLOW_AUTOMATION.md`](./WORKFLOW_AUTOMATION.md)               |
| Follow the visual/design system                   | [`/DESIGN.md`](../DESIGN.md)                                       |
| Work as (or configure) an AI agent                | [`AGENTS.md`](../AGENTS.md) + [`agent-context/`](./agent-context/) |

## Document map

**Human-facing**

- [`/README.md`](../README.md) — public overview, features, quick start.
- [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) — contribution workflow, issues, labels, project board.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture, state model, sync, caching, and the canonical environment-variable map.
- [`API.md`](./API.md) — endpoint reference, caching, supported languages, game modes.
- [`runbook.md`](./runbook.md) — required env vars, pre-deploy checks, incident triage and recovery.
- [`WORKFLOW_AUTOMATION.md`](./WORKFLOW_AUTOMATION.md) — GitHub Actions, pre-commit hooks, Dependabot, releases.

**Agent-facing**

- [`/AGENTS.md`](../AGENTS.md) — canonical agent contract and conventions (source of truth).
- [`/DESIGN.md`](../DESIGN.md) — design contract (validate with `pnpm run design:lint`).
- [`agent-context/`](./agent-context/) — deeper agent guidance and the generated codebase
  knowledge base; start at [`agent-context/summary/index.md`](./agent-context/summary/index.md).

> To avoid drift, each fact has a single owner: code style and commit scopes live in `AGENTS.md`;
> the environment-variable map lives in `ARCHITECTURE.md` and `runbook.md`; API details live in
> `API.md`. Other documents link to those owners instead of restating them.

## Maintainer notes

Roadmap and personal working notes live in [`ROADMAP.md`](./ROADMAP.md).
