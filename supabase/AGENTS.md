# Supabase rules

Applies to `supabase/**`, SQL functions, account/team/token lifecycle, and production database
work. Extends the root `AGENTS.md`; paths below are relative to the repository root.

## Validation

- Relevant checks: `pnpm run supabase:check` (local database replay) for migration or SQL changes.
  Edge Functions run on Deno; their `supabase/functions/_shared/*.deno.test.ts` tests are not
  covered by root Vitest.
- Independent-review triggers: root `AGENTS.md` → Workflow and review.

## Functions and grants

- Security-definer and service-role-only functions revoke `EXECUTE` from `PUBLIC`, `anon`, and
  `authenticated`, granting `service_role` explicitly where required.

## Migrations

Full procedure: `docs/runbook.md#database-migrations`.

- Applied/shared migrations are immutable: do not edit, rename, delete, or squash them, even for
  formatting or static-analysis findings. Treat migrations on `main` as applied unless proven
  otherwise. Use a new forward migration for behavior changes; disposition historical lint findings
  individually.
- After `git fetch`, `git diff --name-status origin/main...HEAD -- supabase/migrations` must list
  only added files, timestamped after the latest migration on `origin/main`.
- Edit, rename, or consolidate an unmerged migration only with verified evidence that it is
  unapplied to every shared environment; matching timestamps do not prove matching SQL or schema.
- Never put bulk data rewrites in migrations. Ship schema separately and make reads tolerate missing
  rows.

## Production database

Prefer the read-only `scripts/ops/prod-db` observer (`docs/runbook.md#production-database-observer`,
`docs/systems/prod-db-observer.md`) with a dedicated observer role; never supply privileged credentials
as observer credentials. Agents collect migration evidence directly; operator-provided records and
human review are not mandatory. Authenticated Supabase MCP may supply project identity, migration
history and bounded catalog-only SELECT queries for dependencies, function contracts, grants and
triggers. CLI migration lists and `db push --dry-run --skip-vault` are authorized read-only checks;
use the observer connection when possible. Follow the target verification, secret handling and
assessment requirements in the runbook. No remote mutation is authorized by an inspection request.

## Account lifecycle

- API token renames update only the owner-scoped `note` (`docs/api.md#active-token-cap`).
- Team owners disband through the confirmed owner function
  (`docs/api.md#team-mutation-edge-functions`).
- Account deletion jobs use the documented claim/fencing transactions
  (`docs/rate-limiting.md#d-account-deletion-limiter`).
