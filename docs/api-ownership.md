# Where changes belong

| Change                                                                                            | Owner                                                                               |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Pages, components, stores, composables, translations and browser Supabase access                  | `app/` here                                                                         |
| Browser-facing server routes, account/billing flows, Tarkov.dev proxy and streamer/profile routes | `app/server/` here (Nitro)                                                          |
| Public token/progress/team HTTP API, OpenAPI and quotas                                           | [TarkovTracker-API](https://github.com/tarkovtracker-org/TarkovTracker-API), `src/` |
| Pure progress rules shared by browser, Nitro and public API                                       | That API repository, `progress-contracts/src/`                                      |
| Database schema/RLS/RPCs, migrations and Edge Functions                                           | `supabase/` here                                                                    |
| Scheduled catalog/KV generation                                                                   | `scripts/precompute/` here                                                          |

For frontend work, start in `app/`. `pnpm run dev` starts Nuxt; it needs no API checkout or shared
compiler watch. The browser continues using Supabase and Nitro directly. UI/store changes stay
here. A shared rule change belongs in the API repository and reaches the frontend through a
separate, reviewed dependency-update PR. Keep one implementation; never copy rules into `app/`.

The public API repository owns `@tarkovtracker/progress-contracts`. This checkout and its legacy
gateway both pin the compiled ESM/types archive from the immutable
[v0.1.0 release](https://github.com/tarkovtracker-org/TarkovTracker-API/releases/tag/v0.1.0).
`workers/contract-tests/api-version.json` records the exact release URL, SHA-512 integrity and
corresponding API tag/commit. `pnpm-lock.yaml` pins those same bytes. No registry publication or
cross-repository symlink is involved. Edit source in the owning API repository, never installed
package files or `dist`.

A dependency update changes both consumer manifests, the lockfile and `api-version.json` together.
Run `pnpm run check:progress-contracts`, frontend tests/typecheck and `pnpm run verify:api-parity`.
The parity command fetches only the recorded API commit into a fresh temporary checkout, uses its
frozen lockfile, compares every compiled rule export and fixture to the installed release, runs
its type/schema/API/DO tests and dry-run build, then checks real browser/Nitro adapters against
that versioned API in PvP, PvE and Seasonal modes. CI runs this command explicitly; ordinary
frontend unit tests do not fetch another repository. Optional full public-catalog captures remain
opt-in. Supabase migration assertions continue running here with their schema owner.

The API source ref/commit can advance separately for an API-only update while the frontend keeps
its contracts version. That update must pass the same checks; compiled API rule exports still
have to match the pinned frontend package. Never follow the API's moving branch head implicitly.

`workers/api-gateway/` remains the **legacy production deployment source** during preparation.
Its code, build commands, Worker Builds watch coverage and Pages DO binding remain functional.
`pnpm run verify:api-standalone` independently installs and tests that gateway against the released
archive without frontend source. Do not retire this directory or its watch paths until the
production source cutover is separately approved. Coordinate any urgent legacy API fix with the
new owner so the two gateway sources do not silently diverge.

API source ownership and frontend release consumption are established separately from production
source cutover. The production cutover still requires explicit approval and preserves Worker `api-gateway`, DO class `ApiGatewayRateLimiter`, migration `v1`,
existing namespace/state, Pages `script_name = "api-gateway"` and the current DO protocol.
Supabase ownership, W10 authority activation and #1086 remain outside this extraction stage.
