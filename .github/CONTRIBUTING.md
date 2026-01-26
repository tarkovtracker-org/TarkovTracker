# Contributing to TarkovTracker

Thank you for your interest in contributing to TarkovTracker! This document provides guidelines and information for contributors.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Issue Guidelines](#issue-guidelines)
- [Pull Request Process](#pull-request-process)
- [Label System](#label-system)
- [Project Board](#project-board)
- [Coding Standards](#coding-standards)
- [Guidelines for AI Coding Agents](#guidelines-for-ai-coding-agents)

## Code of Conduct

Please be respectful and constructive in all interactions. We're building a tool for the Tarkov community together.

## Getting Started

1. **Fork the repository** and clone your fork locally
2. **Install dependencies**: `npm install`
3. **Set up environment**: Copy `.env.example` to `.env` and add your Supabase credentials
4. **Start dev server**: `npm run dev`
5. **Read CLAUDE.md** for detailed development guidelines

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

Issues are automatically labeled based on template selection. Maintainers will add additional labels for:
- **Area**: `area:frontend`, `area:backend`, `area:tasks`, `area:team`, etc.
- **Priority**: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
- **Status**: `status:inbox`, `status:blocked`, `status:needs-info`, etc.
- **Data**: `data:quest`, `data:item` for data-related issues

## Pull Request Process

### Before Submitting

1. **Self-review your code**
   - Remove debug logs and commented code
   - Check for typos and formatting
   - Ensure no secrets or credentials

2. **Test thoroughly**
   - Test manually in browser
   - Run `npm run lint` (must pass with zero warnings)
   - Run `npx vitest` if applicable
   - Test in both PvP and PvE modes if relevant

3. **Update documentation**
   - Update README if adding features
   - Add JSDoc comments for new functions
   - Update CLAUDE.md if changing architecture

### PR Requirements

- Title follows format: `[Type]: Brief description`
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

We use GitHub's native **Issue Types** for categorization and a streamlined **label system** (12 labels total). See [LABELS.md](.github/LABELS.md) for the complete reference.

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

**See CLAUDE.md for comprehensive coding standards. Key points:**

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
- Run `npx vitest` before submitting

### Git Commits
- Write clear, descriptive commit messages
- Use present tense ("Add feature" not "Added feature")
- Reference issue numbers when applicable
- Keep commits focused and atomic

## Guidelines for AI Coding Agents

When working with AI coding assistants on this project:

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
