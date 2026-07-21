# TarkovTracker

[![Crowdin](https://badges.crowdin.net/tarkovtrackerorg/localized.svg)](https://crowdin.com/project/tarkovtrackerorg)
[![codecov](https://codecov.io/gh/tarkovtracker-org/TarkovTracker/graph/badge.svg)](https://codecov.io/gh/tarkovtracker-org/TarkovTracker)
[![Greptile: The War on Bugs](https://www.greptile.com/badge.svg)](https://www.greptile.com/?utm_source=oss_badge&utm_medium=readme&utm_campaign=greptile_for_open_source)

A friendly, comprehensive progress tracker for **Escape from Tarkov**. Track tasks and hideout
progress, collaborate with your team in real time, and switch between PvP and PvE modes without
losing your place. Built with Nuxt 4, Vue 3, Supabase, and Tailwind CSS.

> New here? Issues labeled [`good-first-issue`](https://github.com/tarkovtracker-org/TarkovTracker/labels/good-first-issue)
> are the easiest way to get familiar with the codebase and the contribution process.

## Features

- **Dual game modes** — track PvP and PvE progress separately.
- **Team collaboration** — share progress with teammates in real time via Supabase.
- **Task & objective tracking** — see what is available, what is locked, and what is next.
- **Hideout progress** — track module upgrades and the parts you still need.
- **Player level & faction progress** — monitor leveling across factions.
- **Interactive maps** — explore maps with spawn points and objectives.
- **Streamer tools** — overlays for content creators.
- **Multi-language** — English, German, Spanish, French, Russian, Ukrainian, and Chinese, with
  community translations at [translate.tarkovtracker.org](https://translate.tarkovtracker.org).
  API data can be fetched in any tarkov.dev-supported language.

## Quick start

```bash
corepack enable        # enables pnpm via Corepack (Node >=24.12.0)
pnpm install
pnpm run dev           # http://localhost:3000
```

Copy `.env.example` to `.env` and fill in your Supabase values. Without Supabase configured, the
app runs in offline mode with localStorage only — auth, sync, realtime, and team features are
unavailable.

> Only `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY` are required for login/sync.
> Everything else is optional and documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Common commands

| Task          | Command               |
| ------------- | --------------------- |
| Dev server    | `pnpm run dev`        |
| Build         | `pnpm run build`      |
| Preview build | `pnpm run preview`    |
| Lint          | `pnpm run lint`       |
| Typecheck     | `pnpm run typecheck`  |
| Tests         | `pnpm run test`       |
| Test watch    | `pnpm run test:watch` |

Run `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` before pushing. The full command
list (including i18n, Supabase types, OpenAPI validation, and the API gateway tests) is in
[`AGENTS.md`](AGENTS.md) and [`docs/WORKFLOW_AUTOMATION.md`](docs/WORKFLOW_AUTOMATION.md).

## Contributing

Each pull request must address **one change only** — a single fix, update, doc improvement, or
feature. PRs that bundle unrelated changes may be asked to split or be closed.

- **[How to contribute](.github/CONTRIBUTING.md)** — issues, branches, PR process, and the PR
  template.
- **[Label system](.github/LABELS.md)** — issue types, scope, priority, ownership, and status.
- **[Project board](.github/PROJECT_BOARD.md)** — how issues move from backlog to done.

## Documentation

The short version: this README gets you running; the `docs/` folder explains how things work.

| You want to…                                      | Read                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Get started                                       | This README                                                             |
| Report a security vulnerability                   | [`SECURITY.md`](SECURITY.md)                                            |
| Find where to get help                            | [`SUPPORT.md`](SUPPORT.md)                                              |
| Read the code of conduct                          | [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)                              |
| Understand the systems (caching, data, overlay)   | [`docs/SYSTEMS.md`](docs/SYSTEMS.md)                                    |
| Understand the full architecture & data flow      | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                          |
| Use or extend the HTTP/API surface                | [`docs/API.md`](docs/API.md)                                            |
| Understand rate limits / abuse controls           | [`docs/RATE_LIMITING.md`](docs/RATE_LIMITING.md)                        |
| Deploy, configure env vars, or handle an incident | [`docs/runbook.md`](docs/runbook.md)                                    |
| Understand CI/CD, hooks, and releases             | [`docs/WORKFLOW_AUTOMATION.md`](docs/WORKFLOW_AUTOMATION.md)            |
| Contribute (issues, branches, PRs, labels)        | [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md)                    |
| Work as (or configure) an AI agent                | [`AGENTS.md`](AGENTS.md) + [`docs/agent-context/`](docs/agent-context/) |

Start at [`docs/README.md`](docs/README.md) if you are not sure which doc you need.

## Project structure

```text
app/         Nuxt 4 source (features, stores, server routes, shell, locales)
supabase/    Database migrations and edge functions
workers/     Cloudflare Workers (public API gateway)
scripts/     Precompute and other tooling
docs/        Project documentation
public/      Static assets
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full module map and
[`docs/SYSTEMS.md`](docs/SYSTEMS.md) for how the non-obvious systems (Tarkov.dev integration,
multi-layer caching, overlay corrections, precompute) actually work.

## License

GNU General Public License v3.0 — see [`LICENSE.md`](LICENSE.md).
