# Contributing to TarkovTracker

Thank you for your interest in contributing to TarkovTracker! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Issue Guidelines](#issue-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Types & Label System](#issue-types--label-system)
- [Project Board](#project-board)
- [Coding Standards](#coding-standards)
- [Common Tasks](#common-tasks)
- [Debugging](#debugging)
- [Guidelines for AI Coding Agents](#guidelines-for-ai-coding-agents)
- [Questions?](#questions)

## Code of Conduct

Participation in this project is governed by the [`Code of Conduct`](../CODE_OF_CONDUCT.md).
Please read it before contributing. In short: be respectful and constructive —
we are building a tool for the Tarkov community together. Report conduct issues
to <mailto:support@tarkovtracker.org> or via Discord DM to a maintainer.

## Getting Started

**Prerequisites:** Node.js >= 24.12.0, pnpm 11.14.0 (via Corepack; matches `packageManager`), Git.

1. **Fork the repository** and clone your fork locally
2. **Install dependencies**: `corepack enable && pnpm install` (Corepack resolves the pnpm version from `packageManager` in `package.json`)
3. **Set up environment**: run `pnpm run setup` (creates `.env` from
   `.env.example` if it does not already exist) or copy `.env.example` to `.env`
   manually (only if `.env` does not exist), then add your Supabase credentials.
   Nuxt auto-loads `.env` on `pnpm run dev`.
   Full env-var reference: [`docs/runbook.md`](../docs/runbook.md) and [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
4. **Start dev server**: `pnpm run dev`
5. **Read [`AGENTS.md`](../AGENTS.md)** for detailed development guidelines

> Most features work without Supabase configured; auth and sync are simply disabled.

## Development Workflow

### 1. Find or Create an Issue

- Check existing issues before creating new ones
- Use appropriate issue templates (Bug Report, Feature Request, Enhancement, Data Issue)
- Clearly describe the problem or feature

### 2. Get Assigned

- Comment on the issue to express interest
- Wait for maintainer assignment to avoid duplicate work
- Issues labeled `good-first-issue` are great for newcomers

### 3. Create a Branch

```bash
git checkout -b type/short-description
```

Branch naming convention:

- `fix/issue-description` - Bug fixes
- `feat/feature-name` - New features
- `enhance/improvement` - Enhancements
- `refactor/area-name` - Code refactoring
- `docs/topic` - Documentation
- `chore/task` - Maintenance tasks

### 4. Make Your Changes

- Follow coding standards (see [Coding Standards](#coding-standards))
- Write meaningful commit messages
- Test your changes thoroughly
- Each pull request must focus on a single change (fix, update, documentation, or feature). Unrelated changes may be requested to be split or closed.

### 5. Submit a Pull Request

- Use the PR template
- Link related issues
- Provide clear description and test plan
- Add screenshots/videos for UI changes
- Ensure all checks pass

## Issue Guidelines

### Creating Issues

**Use the right template:**

- **Bug Report** - Something isn't working
- **Feature Request** - New feature or major addition
- **Enhancement** - Improvement to existing feature
- **Data Issue** - Incorrect quest/item/game data

**Provide details:**

- Clear, descriptive title
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Screenshots when relevant
- Game mode (PvP/PvE)
- Browser/environment info

### Issue Labels

The issue **Type** (bug, feature, enhancement, dependencies, documentation) comes from the template you choose. Maintainers then add labels from the streamlined set documented in [LABELS.md](LABELS.md):

- **Area** (optional, can be multiple): `area:ui`, `area:api`, `area:database`, `area:auth`, `area:realtime`, `area:i18n`
- **Priority** (optional): `priority:high`, `priority:medium` (default), `priority:low`
- **Special** (optional): `good-first-issue`, `help-wanted`, `never-stale`, `upstream`

Workflow status (inbox, blocked, in progress, etc.) is tracked by Project board columns, not labels. Data-only issues that belong in the data-overlay repo get `upstream` and are closed with an explanation.

## Pull Request Process

### Before Submitting

1. **Self-review your code**
   - Remove debug logs and commented code
   - Check for typos and formatting
   - Ensure no secrets or credentials

2. **Test thoroughly**
   - Test manually in browser
   - Run `pnpm run lint` (must pass with zero warnings)
   - Run `pnpm run typecheck`
   - Run `pnpm test` if your change touches executable code
   - Test in both PvP and PvE modes if relevant

3. **Update documentation**
   - Update README if adding features
   - Update AGENTS.md if changing architecture or repo-wide agent guidance

### PR Requirements

- Title and commits follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat(tasks): add objective filter`) — enforced by commitlint
- All template sections completed
- Linked to related issue(s)
- Passes all CI checks
- No merge conflicts
- Approved by at least one maintainer

### Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, maintainers will merge
4. Your contribution will be in the next release!

## Issue Types & Label System

We use GitHub's native **Issue Types** for categorization and a streamlined **label system** (13 labels total). See [LABELS.md](LABELS.md) for the complete reference.

### Issue Types (required - choose one)

- 🐛 **bug** - An unexpected problem or behavior
- ✨ **feature** - Adds or improves functionality in the codebase
- ⚡ **enhancement** - Improvement or optimization to existing features
- 📦 **dependencies** - Package updates and dependency management
- 📝 **documentation** - Documentation, guides, or README updates

### Area Labels (optional - technical boundaries)

All area labels use light green color for visual grouping:

- `area:ui` - Vue components, pages, styling
- `area:api` - Nitro server routes, workers, API endpoints
- `area:database` - Supabase schema, migrations, queries
- `area:auth` - Authentication and authorization
- `area:realtime` - Team sync, Supabase broadcasts
- `area:i18n` - Translations and localization

### Priority Labels (optional)

- `priority:high` - Critical bugs, security, important features
- `priority:medium` - Normal priority (default)
- `priority:low` - Nice to have

### Special Labels (optional)

- `good-first-issue` - Good for newcomers
- `help-wanted` - Community help needed
- `never-stale` - Exempt from stale auto-close (long-lived backlog work)
- `upstream` - Issue belongs in data-overlay repo (close with explanation)

### Workflow States

Status labels (needs-info, blocked, in-progress) are **NOT** used. Instead, these are managed via GitHub Project board columns:

- **Inbox** - New issues awaiting triage
- **Waiting for Info** - Need clarification from reporter
- **Blocked** - Waiting on external dependency
- **Backlog** - Triaged, not yet prioritized
- **Todo** - Ready to work on
- **In Progress** - Actively being worked on
- **In Review** - PR awaiting review
- **Done** - Completed/merged

## Project Board

Our GitHub Project uses these columns:

- **📥 Inbox** - New issues awaiting triage
- **📋 Backlog** - Triaged but not yet prioritized
- **📝 Todo** - Ready to work on, prioritized
- **🚧 In Progress** - Actively being worked on
- **👀 In Review** - PR open, awaiting review
- **✅ Done** - Completed/merged

Issues move automatically based on actions:

- Creating an issue → Inbox
- Opening a PR → In Progress
- Marking PR ready for review → In Review
- Merging PR → Done

## Coding Standards

**See AGENTS.md for comprehensive coding standards. Key points:**

### TypeScript & Vue

- Use `<script setup lang="ts">` with TypeScript
- **No `<style>` blocks**—Tailwind v4 is the only styling approach
- 2-space indentation, 100-char line width
- Single quotes, semicolons, trailing commas (es5)

### Imports & Structure

- No blank lines between import groups
- Alphabetically sorted imports
- Use `@/` aliases instead of relative parent imports (`../../`)
- PascalCase components, camelCase functions, kebab-case files

### Styling

- **Tailwind v4 only**—no `<style>` blocks, SCSS, or scoped CSS
- Use Tailwind theme layer for colors—no hex values in templates
- Complex animations go in `app/assets/css/tailwind.css` using `@theme` or `@keyframes`
- Responsive design (mobile-first)

### Error Handling

- Log errors with `logger` from `@/utils/logger`
- Provide user-friendly error messages
- Handle edge cases gracefully

### Testing

- Write tests for new features
- Keep tests deterministic
- Mock network/Supabase calls
- Run `pnpm test` before submitting

### Git Commits

- Follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`. The commit-msg hook runs commitlint locally and CI re-checks every commit.
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `wip`.
- Use an allowed scope from `commitlint.config.js` (e.g. `app`, `ui`, `api`, `tasks`, `team`, `i18n`, `docs`) or omit the scope if none fits — do not invent scopes.
- Keep the subject imperative and not ALL-CAPS; header max 100 chars.
- Reference issue numbers when applicable and keep commits focused and atomic.

## Common Tasks

- **Add a feature:** create a slice in `app/features/`, add a route in `app/pages/`, and a nav link in `app/shell/NavDrawer.vue`.
- **Add a store:** create it in `app/stores/`; configure persistence if it should survive reloads.
- **Add an API endpoint:** create the route in `app/server/api/` and add types in `app/types/`.
- **Add translations:** add snake_case keys to `app/locales/en.json` **only**, then run `pnpm run i18n:check`. Use `$t('key.path', 'Fallback')`. Crowdin propagates the other locales — never edit them by hand.
- **Tarkov.dev import/linking:** follow the rules in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) (persist only `tarkovUid`; the import destination mode is chosen at import time, not stored).

## Debugging

- Install the [Vue DevTools](https://devtools.vuejs.org/) browser extension for component and Pinia store inspection.
- Use the shared logger from `@/utils/logger`, not `console`:

  ```typescript
  import { logger } from '@/utils/logger';

  logger.debug('Debug message', { context: 'value' });
  logger.error('Error message', error);
  ```

## Guidelines for AI Coding Agents

When working with AI coding assistants on this project:

### Context Files

- `AGENTS.md` is the single source of truth for repo-wide agent instructions.
- `.claude/CLAUDE.md` is a thin shim that imports `AGENTS.md` for Claude Code (moved from root to reduce clutter).
- `GEMINI.md` is intentionally not tracked. If you use Gemini CLI, point it at `AGENTS.md` with `.gemini/settings.json`:

```json
{
  "context": {
    "fileName": ["AGENTS.md"]
  }
}
```

- Do not configure Gemini CLI to load both `AGENTS.md` and `GEMINI.md` if one imports the other, or instructions may be duplicated.

### Ask Before Acting

- **Clarify complex or ambiguous requests** before proceeding—don't assume intent
- If a task has multiple valid interpretations, ask which approach is preferred
- When uncertain about scope, confirm boundaries before making changes
- It's better to ask one clarifying question than to redo work

### Communicate Proactively

- Surface potential issues or trade-offs early
- If you encounter blockers or unexpected complexity, report them
- Propose alternatives when the requested approach has significant downsides

### Stay Focused

- Complete one task fully before moving to the next
- Avoid scope creep—stick to what was requested
- Flag related issues you notice, but don't fix them without permission

## Questions?

- Join our [Discord](https://discord.gg/M8nBgA2sT6)
- Ask in issue comments
- Check existing documentation

Thank you for contributing to TarkovTracker! 🎮
