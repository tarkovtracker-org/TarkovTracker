# Where changes belong

| Change                                                                                            | Owner                                     |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Pages, components, stores, composables, translations and browser Supabase access                  | `app/`                                    |
| Browser-facing server routes, account/billing flows, Tarkov.dev proxy and streamer/profile routes | `app/server/` (Nitro)                     |
| Public token/progress/team HTTP API, its OpenAPI spec and quotas                                  | `workers/api-gateway/`                    |
| Pure progress rules shared by browser, Nitro and gateway                                          | `workers/api-gateway/progress-contracts/` |
| Database schema/RLS/RPCs, migrations and Edge Functions                                           | `supabase/`                               |
| Scheduled catalog/KV generation                                                                   | `scripts/precompute/`                     |

If you are working on the frontend, start in `app/`. The browser still talks to Supabase and
Nitro; the public API is not its sole backend. A component or store change belongs in the
frontend. A pure rule used by both runtimes belongs in progress-contracts, with one implementation
and its tests. The repository's `workers/contract-tests/taskFailureParity.test.ts` checks
browser/Worker agreement in PvP, PvE and Seasonal modes.

This first stage makes the gateway installable/testable on its own and gives the shared rules
an explicit versioned boundary. It keeps the frontend, Supabase and precompute ownership in
this repository. It does not activate W10 authority, include #1086, rewrite behavior, move
database ownership, or change production integrations.

The proposed destination is **`tarkovtracker-org/TarkovTracker-API` (public)**, containing the
gateway and progress-contracts package. The proposed shared-package distribution is compiled
ESM/types in immutable versioned GitHub Release tarballs, consumed by exact URL with lockfile
integrity. No new repository or release asset is created in this stage. Repository creation,
release distribution and CI/hosting cutover need a separate approval and plan.

After cutover, API changes happen in that repository; frontend changes remain here. Shared-rule
changes release a new contracts version there and arrive here as an explicit dependency-update
PR that reruns frontend and all-mode parity checks. The same-commit workspace linkage used now
is only the preparatory arrangement, not a cross-repository release dependency.

Deployment must retain Worker `api-gateway`, DO class `ApiGatewayRateLimiter`, migration tag
`v1`, existing namespace/state, Pages `script_name = "api-gateway"` and its current DO protocol.
Schema/API/DO contract tests remain required through any later cutover.
