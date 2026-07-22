# Pull Request Process

This guide covers branching strategy, PR requirements, the PR template, the review process, and the
pre-submit checklist for TarkovTracker. For the contribution workflow overview, see
[`../../.github/CONTRIBUTING.md`](../../.github/CONTRIBUTING.md). For local development setup and
coding standards, see [`./development.md`](./development.md).

## Branching Strategy

Create a branch named with a type prefix and a short description:

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

Each pull request must focus on a single change (fix, update, documentation, or feature). Unrelated
changes may be requested to be split or closed.

## Before Submitting

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
   - Update [`../../AGENTS.md`](../../AGENTS.md) if changing architecture or repo-wide agent guidance

## PR Requirements

- Title and commits follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g.
  `feat(tasks): add objective filter`) — enforced by commitlint
- All template sections completed
- Linked to related issue(s)
- Passes all CI checks
- No merge conflicts
- Approved by at least one maintainer

## PR Template Fields

The PR template ([`../../.github/pull_request_template.md`](../../.github/pull_request_template.md))
asks for the following sections. Complete every section:

- **Summary** — a brief description of what the PR does.
- **Changes** — a list of the key changes made.
- **Type of Change** — mark the relevant option(s): bug fix, new feature, enhancement, refactoring,
  documentation update, dependency update, or other.
- **Area(s) Affected** — mark all that apply: Frontend, Backend, Tasks/Quests, Team Features,
  Hideout, Maps, Traders, API, i18n/Translations, or Other.
- **Related Issues** — link related issues using keywords (`Fixes #123`, `Closes #456`,
  `Related to #789`).
- **Testing** — mark how you tested (locally, production-like environment, unit tests, manual) and
  describe your test plan.
- **Screenshots/Videos** — add screenshots or videos for UI changes.
- **Checklist** — confirm your code follows conventions, you self-reviewed, documentation is updated,
  no new warnings/errors, tests pass, and breaking changes are checked.
- **Additional Notes** — anything reviewers should know.

## Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, maintainers will merge
4. Your contribution will be in the next release!

## Finding Work

- Check existing issues before creating new ones
- Use appropriate issue templates (Bug Report, Feature Request, Enhancement, Data Issue)
- Comment on an issue to express interest and wait for maintainer assignment to avoid duplicate work
- Issues labeled `good-first-issue` are great for newcomers
- See [`../../.github/LABELS.md`](../../.github/LABELS.md) for the complete label reference and
  [`../../.github/PROJECT_BOARD.md`](../../.github/PROJECT_BOARD.md) for project-board workflow
  states
