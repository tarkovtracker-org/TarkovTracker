# API gateway rules

Applies to `workers/api-gateway/**`. Extends the root `AGENTS.md`; paths below are relative to the
repository root.

## Validation

Gateway changes require, in addition to the root validation rules:

- `pnpm --filter api-gateway run types:check`
- `pnpm --filter api-gateway exec wrangler deploy --config wrangler.toml --dry-run`

Focused tests: `pnpm run test:api-gateway`.

## Invariants

- Routes authenticate and enforce quota before decoding or validating input. Validation errors
  retain rate-limit headers (`docs/API.md#rate-limits-api-gateway`).
- Public progress clients send a 5–200 character `User-Agent` (`docs/SYSTEMS.md` §6).
- Rate-limit ownership and fail behavior: `docs/RATE_LIMITING.md` (section B).
