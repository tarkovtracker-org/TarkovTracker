# Public API gateway

Change public HTTP routes, token API behavior, OpenAPI responses, quota handling and the
`ApiGatewayRateLimiter` protocol in this directory. Change shared pure progress rules in
[`workers/api-gateway/progress-contracts`](./progress-contracts/README.md).
For frontend ownership and the planned split, see [where changes belong](../../docs/api-ownership.md).

This package declares its own tooling. After installing the versioned progress-contracts
dependency, run `pnpm run typecheck`, `pnpm run types:check`, `pnpm run validate:openapi`,
`pnpm run test` (Node and workerd), and `pnpm run build` (Wrangler dry-run).
The import boundary check is part of typecheck.

At the repository root, `pnpm run verify:api-standalone` exports only this gateway and a packed
progress-contracts dependency into a fresh temporary directory. It independently installs and
tests the contracts, checks that two packs are byte-identical, installs the tarball in the
gateway, and runs all gateway checks without the frontend checkout. It carries the reviewed
dependency overrides and native-build permissions from the workspace policy and writes the
tarball digest and installed dependency tree to the printed evidence directory.

Migration assertions live in `supabase/migration-tests/` and browser/Worker parity in
`workers/contract-tests/`, because they
need their owning database/frontend sources. They continue running in the root test suite.
They are additional integration checks, separate from the standalone gateway suite.

The production identity is still Worker `api-gateway`, class `ApiGatewayRateLimiter`, migration
`v1`. Moving source does not recreate its namespace or change Pages bindings/protocol. A future
repository/hosting cutover requires separate approval; this stage performs no deployment.
