# Legacy public API deployment source

This directory stays functional until the production source cutover is approved. Public HTTP
routes, OpenAPI, quotas and shared pure progress rules are now owned by
[TarkovTracker-API](https://github.com/tarkovtracker-org/TarkovTracker-API). For everyday frontend
work and dependency updates, see [where changes belong](../../docs/api-ownership.md).

The gateway pins the same immutable `@tarkovtracker/progress-contracts` release as the frontend.
From this directory run `pnpm run dev`, `pnpm run typecheck`, `pnpm run types:check`,
`pnpm run validate:openapi`, `pnpm run test` (Node and workerd) and `pnpm run build` (Wrangler
dry-run). It has no local contracts compiler or frontend tooling dependency.

Root `pnpm run verify:api-standalone` exports this gateway to a fresh temporary directory, installs
its released dependency with the reviewed overrides/native-build permissions, then runs every
gateway check without frontend sources. Its evidence records release integrity and the installed
dependency tree. Root `pnpm run verify:api-parity` separately tests the actual release-corresponding
API commit and all-mode browser/Nitro agreement; this legacy copy is not the parity oracle.

Supabase migration assertions remain in `supabase/migration-tests/`. Worker `api-gateway`, class
`ApiGatewayRateLimiter`, migration `v1`, namespace/state and Pages bindings/protocol retain their
identity. Keep the existing source/watch paths until a separately approved production cutover.
