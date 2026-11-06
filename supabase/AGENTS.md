# Supabase rules

Applies to `supabase/**`, SQL functions, account/team/token lifecycle, and production database
work. Extends the root `AGENTS.md`; paths below are relative to the repository root.

## Validation

- Relevant checks: `pnpm run supabase:check` (local database replay) for migration or SQL changes.
  Edge Functions run on Deno; their `supabase/functions/_shared/*.deno.test.ts` tests are not
  covered by root Vitest.
- Review and merge class: root `AGENTS.md` → Workflow and review.

## Functions and grants

- Security-definer and service-role-only functions revoke `EXECUTE` from `PUBLIC`, `anon`, and
  `authenticated`, granting `service_role` explicitly where required.
- New `postgres` functions have no default `PUBLIC` EXECUTE in any schema and no default client
  EXECUTE outside platform-owned `storage`; grant every calling role explicitly
  (`docs/runbook.md#function-execute-defaults`).
- Client-callable security-definer bodies live in `private`; `public` exposes them only through
  same-signature `SECURITY INVOKER` wrappers. Wrappers run as the caller, so these bodies keep
  `authenticated` and `service_role` `EXECUTE` (never `PUBLIC` or `anon`).
  `supabase/tests/database/client_definer_rpcs.test.sql` mirrors advisor lints 0028/0029; fix new
  findings instead of suppressing them.

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

- The public API Worker reads/calls the relations, columns and RPCs pinned in
  `supabase/tests/database/api_gateway_surface.test.sql` (from the API repo's `supabase-surface.json`).
  Keep them, their argument names and `service_role` grants; add new objects before the Worker uses them.
- API token renames update only the owner-scoped `note` (`docs/api.md#active-token-cap`).
- Team owners disband through the confirmed owner function
  (`docs/api.md#team-mutation-edge-functions`).
- Account deletion jobs use the documented claim/fencing transactions
  (`docs/rate-limiting.md#d-account-deletion-limiter`).
