# API gateway rules

Applies to `workers/api-gateway/**`. Extends the root `AGENTS.md`; paths below are relative to the
repository root.

## Validation

Gateway changes require, in addition to the root validation rules:

- `pnpm --filter api-gateway run types:check`
- `pnpm --filter api-gateway exec wrangler deploy --config wrangler.toml --dry-run`

Focused tests: `pnpm run test:api-gateway`.

Gateway tooling is local: from this directory run `pnpm run typecheck` (includes import
boundaries), `pnpm run types:check`, `pnpm run validate:openapi`, `pnpm run test` and
`pnpm run build` (dry-run). Root `pnpm run verify:api-standalone` proves these checks against a
packed contracts dependency without any frontend source or tooling. Keep its dependency
overrides and native-build permissions. Schema assertions stay with their DB owner in
`supabase/migration-tests/`; browser/Worker parity stays under `workers/contract-tests/`.
Both remain in the root test suite.

Shared pure rules belong in `workers/api-gateway/progress-contracts/`; no gateway imports may escape to
`app/`, `shared/`, Supabase or root fixtures. See `docs/api-ownership.md` for ownership and the
downstream version-update path. Preserve Worker/class/migration/state identity during extraction.

## Invariants

- Routes authenticate and enforce quota before decoding or validating input. Validation errors
  retain rate-limit headers (`docs/api.md#rate-limits-api-gateway`).
- Public progress clients send a 5–200 character `User-Agent` (`docs/systems/progress-api.md`).
- Rate-limit ownership and fail behavior: `docs/rate-limiting.md` (section B).
