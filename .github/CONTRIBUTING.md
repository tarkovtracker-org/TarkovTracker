# Contributing to TarkovTracker

Thank you for your interest in contributing to TarkovTracker! This document is the entry point for
contributors. It covers the basics and links to focused guides for details.

> Contributors using an AI coding agent must also follow [`../AGENTS.md`](../AGENTS.md). Human setup
> and pull-request requirements are documented here and in the linked pages below.

## Ways to Contribute

- **Report issues** — bugs, features, enhancements, or data issues. Pick the right template from the
  issue tracker.
- **Submit pull requests** — fix a bug, add a feature, or improve docs.
- **Translate** — add keys to `app/locales/en.json` only; Crowdin propagates the other locales. See
  [`../docs/contributing/development.md`](../docs/contributing/development.md) for the i18n workflow.

## Where to Ask Questions

- Join our [Discord](https://discord.gg/M8nBgA2sT6)
- Ask in issue comments
- Check [`../SUPPORT.md`](../SUPPORT.md) for routing (usage questions, bugs, features, account
  support, security)

## How to Find and Claim Work

1. Check existing issues before creating new ones
2. Use the appropriate issue template (Bug Report, Feature Request, Enhancement, Data Issue)
3. Comment on an issue to express interest and wait for maintainer assignment to avoid duplicate work
4. Issues labeled `good-first-issue` are great for newcomers

For the complete label reference, see [`LABELS.md`](LABELS.md). For project-board workflow states and
automation, see [`PROJECT_BOARD.md`](PROJECT_BOARD.md).

## Development Setup (Summary)

**Prerequisites:** Node.js >= 24.12.0, pnpm 11.14.0 (via Corepack), Git.

```bash
corepack enable && pnpm run setup   # installs deps + creates .env
pnpm run dev                        # localhost:3000
```

> Most features work without Supabase configured; auth and sync are simply disabled.

For the full setup guide, coding standards, common tasks, debugging, and commit conventions, see
[`../docs/contributing/development.md`](../docs/contributing/development.md).

## Pull Request Process (Summary)

1. Create a branch: `git checkout -b type/short-description`
   (`fix/`, `feat/`, `enhance/`, `refactor/`, `docs/`, `chore/`)
2. Make your changes following the coding standards
3. Self-review, run the smallest relevant validation (`pnpm run lint` for code, `pnpm run typecheck`
   for Nuxt/TS, `pnpm --filter api-gateway run typecheck` for Workers, `pnpm test` for executable
   code), and update docs
4. Open a PR using the template, link related issues, and ensure all CI checks pass
5. Address review feedback; a maintainer merges once approved

For detailed PR requirements, the template fields, the review process, and the pre-submit checklist,
see [`../docs/contributing/pull-requests.md`](../docs/contributing/pull-requests.md).

## Review Expectations

- Each PR focuses on a single change; unrelated changes may be requested to be split or closed.
- Maintainers review for correctness, style, tests, and scope.
- Address all feedback on the same PR branch; do not open follow-up PRs for in-scope feedback.
- Your contribution ships in the next release once merged.

## Security and Conduct

- **Security vulnerabilities:** see [`../SECURITY.md`](../SECURITY.md) — do not open a public issue.
- **Code of Conduct:** governed by [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md). Be respectful
  and constructive. Report conduct issues to <mailto:support@tarkovtracker.org> or via Discord DM to
  a maintainer.

Thank you for contributing to TarkovTracker! 🎮
