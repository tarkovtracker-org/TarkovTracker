# TarkovTracker Systems Spec

<!-- AGENT QUICK REFERENCE
Endpoint table with cache TTLs: game-data.md (Tarkov.dev data integration).
Each section ends with code-binding INVARIANTS — check these when modifying a system.
Game-mode + Seasonal progress storage: progress-storage.md.
Implementing files are listed within each section body.
-->

This document explains **how the non-obvious systems in TarkovTracker actually work**, in plain
language with diagrams. It is the spec you point at when you want to ask "why does the app do X?"
and have an agent verify the answer against the code.

> **How to use this doc**
>
> - Each system has: a short plain-English summary, a diagram, a step-by-step flow, a list of the
>   files that implement it, and the **invariants** the code must hold. If the code and an invariant
>   disagree, the code is the bug (or the invariant is stale — fix the doc in the same PR).
> - File paths are relative to the repo root so agents can open them directly.
> - When a system changes, update its section here in the same PR. `AGENTS.md` enforces this.

## Systems

| File                                                       | Systems                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`game-data.md`](./game-data.md)                           | Tarkov.dev data integration, data fetching pipeline, multi-layer caching          |
| [`overlay-and-precompute.md`](./overlay-and-precompute.md) | Overlay corrections, precompute workflow                                          |
| [`progress-api.md`](./progress-api.md)                     | How an external `GET /progress` is served                                         |
| [`progress-storage.md`](./progress-storage.md)             | Game-mode and Seasonal progress storage, sharing, backups, prestige               |
| [`progress-sync.md`](./progress-sync.md)                   | Save status, cloud retry, recovery copies, sign-out, Realtime sync                |
| [`teams.md`](./teams.md)                                   | Mode-scoped teams, team channel, team events and atomic leave/kick                |
| [`imports.md`](./imports.md)                               | Tarkov.dev profile import, EFT log import                                         |
| [`tasks.md`](./tasks.md)                                   | Canonical task progression, map objectives, task list and Needed Items            |
| [`frontend.md`](./frontend.md)                             | Promoted Twitch configuration, boot-time asset-failure recovery, light/dark theme |
| [`prod-db-observer.md`](./prod-db-observer.md)             | Read-only production database observer                                            |
| [`ci-and-release.md`](./ci-and-release.md)                 | Test execution, CI validation selection, Fallow snapshots, release publication    |
| [`previews.md`](./previews.md)                             | Actions-owned Cloudflare previews and the `Preview Result` gate                   |

The [Season Planner](./season-planner.md) documents local Kord Breach modifier plans.

## When this doc is wrong

If you read something here that does not match the code, the disagreement is a bug — either in the
code (fix the code) or in this spec (fix the doc in the same PR). `AGENTS.md` (Scoped rules)
requires updating the owning file whenever one of these systems changes. When in doubt, the code
is the source of truth and this spec is the explanation of it.
