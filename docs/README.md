# TarkovTracker Documentation

Start here to find the right document. This folder holds technical and process documentation. The
canonical agent contract and project conventions live in the root [`AGENTS.md`](../AGENTS.md).

Docs explain behavior in plain English for humans and agents; code is the source of truth and docs
may lag — verify against code before changing behavior. One fact, one owner: link the owning file
instead of restating it.

## Which doc do I need?

| I want to…                                                                        | Read                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Understand the project and get it running                                         | [`/README.md`](../README.md)                            |
| Report a security vulnerability                                                   | [`/SECURITY.md`](../SECURITY.md)                        |
| Find where to ask for help or report something                                    | [`/SUPPORT.md`](../SUPPORT.md)                          |
| Read the code of conduct                                                          | [`/CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md)          |
| Contribute (issues, branches, PRs, labels)                                        | [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) |
| Set up dev, follow coding standards, submit a PR                                  | [`contributing.md`](./contributing.md)                  |
| Understand how a specific system works (caching, data fetch, overlay, precompute) | [`systems/`](./systems/README.md)                       |
| Understand the deeper architecture, state model, and data flows                   | [`architecture.md`](./architecture.md)                  |
| Read the Tarkov data architecture decision and implementation plan                | [`decision-tarkov-data.md`](./decision-tarkov-data.md)  |
| Use or extend the HTTP/API surface                                                | [`api.md`](./api.md)                                    |
| Decide whether an API/frontend change belongs here or in the gateway              | [`api-ownership.md`](./api-ownership.md)                |
| Understand rate limits / abuse controls by layer                                  | [`rate-limiting.md`](./rate-limiting.md)                |
| Deploy, configure env vars, or handle an incident                                 | [`runbook.md`](./runbook.md)                            |
| Understand CI/CD, hooks, and releases                                             | [`workflow-automation.md`](./workflow-automation.md)    |
| Find what a file in `scripts/` does and what runs it                              | [`/scripts/README.md`](../scripts/README.md)            |
| Check test-coverage gates and reproduction                                        | [`testing-coverage.md`](./testing-coverage.md)          |
| Follow the visual/design system                                                   | [`/DESIGN.md`](../DESIGN.md)                            |
| Work as (or configure) an AI agent                                                | [`AGENTS.md`](../AGENTS.md)                             |

## Document map

- [`/README.md`](../README.md) — public overview, features, quick start.
- [`/SECURITY.md`](../SECURITY.md) — vulnerability reporting policy and scope.
- [`/SUPPORT.md`](../SUPPORT.md) — routing table for questions, bugs, features, and account support.
- [`/CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) — Contributor Covenant 2.1 with enforcement contacts.
- [`.github/CONTRIBUTING.md`](../.github/CONTRIBUTING.md) — contribution workflow entry point (issues, branches, PRs, labels, project board).
- [`contributing.md`](./contributing.md) — local setup, coding standards, common tasks, commit conventions, and the PR process.
- [`systems/`](./systems/README.md) — plain-language spec of the non-obvious systems (Tarkov.dev integration, data fetching, multi-layer caching, overlay, precompute, progress storage, teams, previews), one file per area, with diagrams and invariants. Covers **what systems exist, what they own, and how they interact**. Point at this when asking "why does the app do X?".
- [`architecture.md`](./architecture.md) — deeper technical structure: state model, sync, data flows, implementation decisions, tradeoffs, and the canonical environment-variable map. `systems/` is the entry point for system behavior; `architecture.md` is the deeper reference for how the app is built.
- [`decision-tarkov-data.md`](./decision-tarkov-data.md) — durable architecture decision and resumable implementation plan for the Tarkov data and progress system (KV releases, shared rules engine, Supabase write consolidation).
- [`eft-log-reference/`](./eft-log-reference/) — privacy-normalized reference for EFT (and Arena) local log events: what data the game writes, where, and in which builds. Historical evidence base for the EFT logs import feature.
- [`api.md`](./api.md) — endpoint reference, caching, supported languages, game modes.
- [`rate-limiting.md`](./rate-limiting.md) — ownership map for API, Edge, Pages, DB, and Auth rate-limit systems.
- [`account-retention.md`](./account-retention.md) — inactivity policy, activity tracking design, and cleanup rollout requirements.
- [`runbook.md`](./runbook.md) — required env vars, pre-deploy checks, incident triage and recovery.
- [`tarkov-clearance-rollout.md`](./tarkov-clearance-rollout.md) — proposed game-data browser verification infrastructure, approval gates, acceptance evidence and edge-first rollback.
- [`workflow-automation.md`](./workflow-automation.md) — GitHub Actions, pre-commit hooks, Dependabot, releases.
- [`ci-efficiency-audit.md`](./ci-efficiency-audit.md) — CI coverage inventory and measured setup optimization.
- [`test-signal-audit-2026-10-04.md`](./test-signal-audit-2026-10-04.md) — historical test inventory and conditional proposals; no test removals.
- [`/scripts/README.md`](../scripts/README.md) — what each repository script does and what runs it.
- [`code-review.md`](./code-review.md) — production-readiness review policy: risk areas, severity calibration, deployment and rollback checks.
- [`testing-coverage.md`](./testing-coverage.md) — coverage gates and reproduction. Exact floors live in `vitest.config.ts`.

### Agent-facing

- [`/AGENTS.md`](../AGENTS.md) — canonical agent contract and conventions (source of truth).
- [`/DESIGN.md`](../DESIGN.md) — design contract (validate with `pnpm run design:lint`).

> To avoid drift, each fact has a single owner: agent conventions and required validation live in
> `AGENTS.md` (plus path-scoped `AGENTS.md` files); commit types live in `scripts/checks/commit-types.mjs`;
> the environment-variable map lives in `architecture.md` (`runbook.md` links to it for ops); API
> details live in `api.md`; rate-limit ownership lives in `rate-limiting.md`; plain-language system
> specs (caching, data fetching, overlay, precompute) live in `systems/`. Other documents link to
> those owners instead of restating them.

## Conventions for new docs

Flat `docs/` root, `kebab-case.md` (`README.md` is the only uppercase exception). Nest only for 3+
docs or non-`.md` assets. Never restate code, config, or another doc — link to it.

## Maintainer notes

Roadmap and personal working notes live in [`roadmap.md`](./roadmap.md).
