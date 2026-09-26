# Supabase rules

Applies to `supabase/**`, SQL functions, account/team/token lifecycle, and production database
work. Extends the root `AGENTS.md`; paths below are relative to the repository root.

## Validation

- Relevant checks: `pnpm run supabase:check` (local database replay) for migration or SQL changes.
  Edge Functions run on Deno; their `supabase/functions/_shared/*.deno.test.ts` tests are not
  covered by root Vitest.
- Auth, billing, migration, and concurrency changes require independent review (root `AGENTS.md`
  → Review).

## Functions and grants

- Security-definer and service-role-only functions revoke `EXECUTE` from `PUBLIC`, `anon`, and
  `authenticated`, granting `service_role` explicitly where required.

## Migrations

Full procedure: `docs/runbook.md#database-migrations`.

- Applied/shared migrations are immutable: do not edit, rename, delete, or squash them, even for
  formatting or static-analysis findings. Treat migrations on `main` as applied unless proven
  otherwise. Use a new forward migration for behavior changes; disposition historical lint findings
  individually.
- Before migration work, compare the migration diff with `origin/main`
  (`git diff --name-status origin/main...HEAD -- supabase/migrations`) and obtain operator evidence
  of remote history and pending migrations. Matching timestamps do not prove matching SQL or schema.
- Consolidate only unmerged migrations proven unapplied to every shared environment. Never run
  remote history repair, reset, or squash as routine cleanup.
- Never put bulk data rewrites in migrations. Ship schema separately and make reads tolerate missing
  rows.

## Production database

Inspect production only through the read-only `scripts/prod-db` observer
(`docs/runbook.md#production-database-observer`, `docs/SYSTEMS.md` §9), using a dedicated observer
role; never supply `service_role`, `postgres`, migration, or Management API credentials.

## Account lifecycle

- API token renames update only the owner-scoped `note` (`docs/API.md#active-token-cap`).
- Team owners disband through the confirmed owner function
  (`docs/API.md#team-mutation-edge-functions`).
- Account deletion jobs use the documented claim/fencing transactions
  (`docs/RATE_LIMITING.md#d-account-deletion-limiter`).
