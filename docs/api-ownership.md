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
makes it reachable on the apex now that the overlaid Worker bindings are removed. www keeps its
canonical 308 to the apex (see [www outcome](#www-outcome)).

The small [Pages entry wrapper](../app/server/pages-entry.ts) is needed because Nitro 2's Pages
adapter buffers POST bodies before running middleware. That would consume a retired upload and
delay its static rejection until the upload completes. The wrapper calls the same response helper
first and otherwise delegates the original Request, environment, and context to the installed
adapter; it preserves the adapter's other exports and is applied only to the Pages runtime,
not prerender/dev. It introduces no other platform behavior. The compiled-worker check
(`node --test scripts/checks/legacy-api-pages.mjs`, after build) makes body reads and binding
access throw on retirement and verifies normal POST/asset behavior separately. This proves the
body-isolation contract, not a measured production CPU, billing, or security improvement.
The manual wrapper-disabled negative control still returned 410 for a retired POST, but recorded
one adapter body read and `bodyUsed=true`; the unread-body assertion failed as expected. Reproduce
it in an isolated checkout, restoring the source before a normal build:

1. Disable only `nitro.options.entry = resolve(appDir, 'server/pages-entry.ts')` in the
   `nitro:init` hook, keeping retirement middleware enabled. Build using the anonymous preview
   profile (`NODE_ENV=production`, `CI=true`, preview `APP_URL`, and no production credentials).
2. Start the same workerd harness configuration as
   [`legacy-api-pages.mjs`](../scripts/checks/legacy-api-pages.mjs), with main
   `scripts/checks/legacy-api-pages-worker.mjs`. Send a plain POST to
   `https://tarkovtracker.org/api/progress` with body `{invalid json`, **without**
   `X-Test-Unread-Body` or `X-Test-No-Bindings`. Those throw flags are intentionally absent:
   this control observes the adapter's read instead of preventing it.
3. The [test-only instrumentation](../scripts/checks/legacy-api-pages-worker.mjs) reports status
   410, `X-Test-Body-Reads: 1`, and `X-Test-Body-Used: true`. Requiring bodyUsed=false fails.
   Close the harness, restore the entry assignment, rebuild, and run the normal compiled suite.

The owning [compiled checks](../scripts/checks/legacy-api-pages.mjs) cover the enabled wrapper;
[adapter unit tests](../app/server/__tests__/pages-entry.test.ts) cover identity and callback
pass-through. The negative control is a manual experiment, not an extra CI build.

Promote in this order, with explicit approval for production merges/deployments and route removal:

1. Align both gateway Wrangler configurations with the **eleven** intended bindings. Remove only
   the six redundant/retired routes: apex/www `/health` and the four redundant API-host routes.
   This persists the operator's manual removals, which an unchanged config redeploy can restore.
   Keep all ten legacy bindings. Deploy the Pages retirement handler and verify the exact
   deployed SHA, Function routing, and host/path/method boundary before changing those bindings.
   Use the anonymous PR preview and compiled Pages Worker HTTP tests before promotion; previews
   on `pages.dev` intentionally do not return the apex-only 410. The production Pages deployment
   must be verified separately; a green preview is not permission to remove live routes.
2. www edge: keep the canonical www redirect; www legacy calls reach the apex 410 through a 308.
   See [www outcome](#www-outcome). Never exempt all `/api/*` or disable the rule broadly.
3. Remove the ten legacy bindings by exact route ID (apex `/api/v2` first as a canary) and
   promote the route-removal change in both repositories, leaving **only**
   `api.tarkovtracker.org/*`. Apply the route change using the current production source; this is
   not authorization to connect the API repository to Worker Builds. Updating both sources
   prevents a later deployment from restoring legacy bindings.
4. Verify the [retired HTTP contract](./api.md#progress-api-host-apitarkovtrackerorg) externally,
   including query and trailing-slash variants, with redirect following disabled.
   Check API `/health` => 200 and a normal
   first-party frontend route. Existing Pages static handling retires apex `/health` with 404;
   without the health Worker bindings, www redirects to that 404. Keep that behavior and verify
   `/health/` and query variants.
   No apex health monitors were found in the repositories or Cloudflare; unknown external
   monitors may still need to move to the API host.

The broad historical Worker `token*`/`progress*` patterns also intercept unrelated
suffixes; after removal those return to normal frontend
routing, while retirement remains precisely slash-delimited. These changes do not alter DNS,
credentials, Worker identity, DO namespaces/state, or unrelated routing.

If the Pages response regresses, an approved rollback can restore the exact ten legacy bindings
from the prior config commit, giving the prior static Worker 404 while Pages is repaired. Do not restore the six redundant/health
bindings. Source cutover remains a separate decision.

### www outcome

Retirement completed on 2026-10-12 ([#1170](https://github.com/tarkovtracker-org/TarkovTracker/issues/1170)).
The originally held plan associated `www.tarkovtracker.org` with Pages project `tarkovtracker`
and exempted the retired families from Single Redirect rule `214cb75a91f343dea59d29f8aaea9275`.
Association activated through the existing proxied CNAME without a DNS change, but an active
Pages custom domain bypasses both that redirect rule and www Worker routes: every www path served
Pages directly, dropping the canonical redirect. The association was removed within a minute.

The accepted contract keeps the rule unchanged (308 to `concat("https://tarkovtracker.org",
http.request.uri.path)`, query preserved, all www requests). www legacy calls therefore receive
308 and then the apex 410/204; the redirect runs before Worker routes, so www bindings were
unreachable. Do not add www to the Pages project without moving canonicalization into the app.
