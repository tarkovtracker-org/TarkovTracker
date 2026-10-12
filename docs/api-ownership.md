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

## Legacy address retirement

Retirement does not change production source ownership. The Pages implementation is
[`00.legacy-api-retirement.ts`](../app/server/middleware/00.legacy-api-retirement.ts); its exact
host/path and HTTP contract lives in [api.md](./api.md). Existing `/api/*` Pages Function routing
already makes it reachable once the overlaid Worker bindings are removed.

The small [Pages entry wrapper](../app/server/pages-entry.ts) is needed because Nitro 2's Pages
adapter buffers POST bodies before running middleware. That would consume a retired upload and
delay its static rejection until the upload completes. The wrapper calls the same response helper
first and otherwise delegates the original Request, environment, and context to the installed
adapter; it preserves the adapter's other exports and is applied only to the Pages runtime,
not prerender/dev. It introduces no other platform behavior. The compiled-worker check
(`node --test scripts/checks/legacy-api-pages.mjs`, after build) makes body reads and binding
access throw on retirement and verifies normal POST/asset behavior separately. This proves the
body-isolation contract, not a measured production CPU, billing, or security improvement.

Promote in this order, with explicit approval for production merges/deployments and route removal:

1. Align both gateway Wrangler configurations with the **eleven** intended bindings. Remove only
   the six redundant/retired routes: apex/www `/health` and the four redundant API-host routes.
   This persists the operator's manual removals, which an unchanged config redeploy can restore.
   Keep all ten legacy bindings. Deploy the Pages retirement handler and verify the exact
   deployed SHA, Function routing, and host/path/method boundary before changing those bindings.
   Use the anonymous PR preview and compiled Pages Worker HTTP tests before promotion; previews
   on `pages.dev` intentionally do not return the apex-only 410. The production Pages deployment
   must be verified separately; a green preview is not permission to remove live routes.
2. Only after that verification, promote the separately held route-removal change in both
   repositories. It leaves **only** `api.tarkovtracker.org/*`. Apply the route change using the
   current production source; this is not authorization to connect the API repository to Worker
   Builds. Updating both sources prevents a later deployment from restoring legacy bindings.
3. Check apex/www legacy GET/POST => 410 JSON, HEAD => 410 without a body, and valid preflight =>
   204, including query and trailing-slash variants. Check API `/health` => 200 and a normal
   first-party frontend route. Existing Pages static handling retires apex `/health` with 404;
   without the health Worker bindings, www redirects to that 404. Keep that behavior and verify
   `/health/` and query variants.
   No apex health monitors were found in the repositories or Cloudflare; unknown external
   monitors may still need to move to the API host.

The intermediate Worker 404 remains until step 2. The broad historical Worker `token*`/`progress*`
patterns also intercept unrelated suffixes; after removal those return to normal frontend
routing, while retirement remains precisely slash-delimited. No DNS, credentials, Worker
identity, DO namespaces/state, or unrelated routing changes belong in this promotion.

If Pages verification fails, keep the ten bindings and fix Pages before promotion. After removal,
an approved rollback can restore those exact ten bindings from the prior config commit, giving
the prior static Worker 404 while Pages is repaired. Do not restore the six redundant/health
bindings. Source cutover remains a separate decision.
