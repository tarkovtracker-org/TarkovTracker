# scripts/ops/

Production operations tooling. The observer is the only allowed way to inspect the production
database; see [`AGENTS.md`](../../AGENTS.md), [`supabase/AGENTS.md`](../../supabase/AGENTS.md), and
[`docs/runbook.md`](../../docs/runbook.md).

| File               | What it does                                                          | Run by                          |
| ------------------ | --------------------------------------------------------------------- | ------------------------------- |
| `prod-db`          | Command wrapper: `scripts/ops/prod-db <command>`. Runs `prod-db.mjs`. | by hand, agents                 |
| `prod-db.mjs`      | Read-only production database observer.                               | `prod-db`                       |
| `prod-db.test.mjs` | Vitest tests for the observer.                                        | `pnpm run test`, `prod-db:test` |
