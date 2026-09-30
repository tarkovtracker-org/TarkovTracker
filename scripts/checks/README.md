# scripts/checks/

Formatting, linting, and consistency checks. Each one runs locally through a `pnpm` command and
most also run in CI or the pre-commit hook.

| File                      | What it does                                                             | Run by                                               |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `format-files.mjs`        | Runs Prettier over tracked files.                                        | `format:prettier`, `format:check:prettier`           |
| `lint-blank-lines.mjs`    | Enforces the compact blank-line style; `--fix` rewrites files.           | `lint:blank-lines`, `format:blank-lines`, pre-commit |
| `lint-i18n.mjs`           | Checks `en.json` keys are snake_case and compares other locales' keys.   | `i18n:check`, pre-commit                             |
| `fallow-audit.mjs`        | Runs Fallow code-health checks on changes against a base ref.            | `lint:fallow`                                        |
| `check-systems-drift.mjs` | Verifies volatile facts in `docs/systems.md` still match the code.       | `systems:check`, `ci.yml`                            |
| `check-supabase-db.sh`    | Rebuilds the **local** Supabase DB from migrations and lints the schema. | `supabase:check`                                     |
| `*.test.mjs`              | Vitest tests for the scripts above.                                      | `pnpm run test`                                      |
