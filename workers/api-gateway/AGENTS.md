# API gateway rules

Applies to `workers/api-gateway/**`. Extends the root `AGENTS.md`; paths below are relative to the
repository root.

## Validation

Gateway changes require, in addition to the root validation rules:

- `pnpm --filter api-gateway run types:check`
- `pnpm --filter api-gateway run build` (Wrangler dry-run)

Focused tests: `pnpm run test:api-gateway`.

Gateway tooling is local: from this directory run `pnpm run typecheck` (includes import
boundaries), `pnpm run types:check`, `pnpm run validate:openapi`, `pnpm run test` and
`pnpm run build` (dry-run). Root `pnpm run verify:api-standalone` proves these checks against a
released contracts dependency without any frontend source or tooling. Keep its dependency
overrides and native-build permissions. Schema assertions stay with their DB owner in
`supabase/migration-tests/`; browser/Worker parity stays under `workers/contract-tests/`.
Schema assertions remain in the root test suite. `pnpm run verify:api-parity` fetches the exact
API commit paired with the release and runs browser parity plus its standalone API/DO checks.

This directory remains the production deployment source until an approved cutover. New public API
and pure-rule changes belong in `tarkovtracker-org/TarkovTracker-API`; shared rules arrive here
through a reviewed release dependency update. No gateway imports may escape to `app/`, `shared/`,
Supabase or root fixtures. See `docs/api-ownership.md`; preserve Worker/class/migration/state identity.

## Invariants

- Routes authenticate and enforce quota before decoding or validating input. Validation errors
  retain rate-limit headers (`docs/api.md#rate-limits-api-gateway`).
- Public progress clients send a 5–200 character `User-Agent` (`docs/systems/progress-api.md`).
- Rate-limit ownership and fail behavior: `docs/rate-limiting.md` (section B).
