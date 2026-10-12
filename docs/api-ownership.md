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

The public API repository owns `@tarkovtracker/progress-contracts`. This checkout pins the compiled ESM/types archive from the immutable
[v0.1.0 release](https://github.com/tarkovtracker-org/TarkovTracker-API/releases/tag/v0.1.0).
`workers/contract-tests/api-version.json` records the exact release URL, SHA-512 integrity and
corresponding API tag/commit. `pnpm-lock.yaml` pins those same bytes. No registry publication or
cross-repository symlink is involved. Edit source in the owning API repository, never installed
package files or `dist`.

A dependency update changes the frontend manifest, lockfile and `api-version.json` together.
Run `pnpm run check:progress-contracts`, frontend tests/typecheck and `pnpm run verify:api-parity`.
The parity command fetches only the recorded API commit into a fresh temporary checkout, uses its
frozen lockfile, compares every compiled rule export and fixture to the installed release, runs
its type/schema/API/DO tests and dry-run build, then checks real browser/Nitro adapters against
that versioned API in PvP, PvE and Seasonal modes. CI runs this command explicitly; ordinary
frontend unit tests do not fetch another repository. Optional full public-catalog captures remain
opt-in. Supabase migration assertions continue running here with their schema owner;
`supabase/tests/database/api_gateway_surface.test.sql` pins every object the API Worker uses,
matching the API repository's `supabase-surface.json`.

The API source ref/commit can advance separately for an API-only update while the frontend keeps
its contracts version. That update must pass the same checks; compiled API rule exports still
have to match the pinned frontend package. Consumer integration tests never follow the API's moving branch head implicitly.

Production source cutover completed on 2026-10-12. The existing `api-gateway` Worker now builds
from `TarkovTracker-API/main`, root `/`, using `pnpm run deploy` to prepare workspace contracts.
The legacy Tracker build trigger was disconnected; the configured automatic build source is only
the API repository. Its protected main branch is the deployment source; consumer tests instead
fetch the explicit tag/commit. These are distinct: there is no automatic equality check between
the live Worker SHA and the consumer pin. Before an API rollout, maintainers must review matching
frontend integration evidence and any needed source-pin update, then verify the actual build SHA
and active Worker version after deployment. The cutover below verified that mapping explicitly.
API commit `655b825ddfc863a2bc56f88eea97a5bbb15744ce` built as `4ffaa165-f64f-4eb0-b21f-b2821e30f97a`
and became active version `2043aeb0-6daa-47f2-af25-26a267ddbceb` at 100%. Consumer integration pins
that exact source through source-only tag `v0.1.2`; the contracts archive remains `v0.1.0`.
The duplicate gateway is removed from this checkout; retain the external parity tests and Supabase
schema assertions here. API deployment and rollback instructions belong in
[API operations](https://github.com/tarkovtracker-org/TarkovTracker-API/blob/main/docs/operations.md).

Worker identity, class `ApiGatewayRateLimiter`, migration `v1`, DO namespace
`832c68d546974f9884747962b5efe97d`, Pages `script_name = "api-gateway"`, the DO protocol,
abuse namespace `1001`, secrets and route `api.tarkovtracker.org/*` are preserved.
The pre-cutover serving version `e470b448-d198-4138-9da4-054fb937e0ed` and old source settings
were retained for rollback; disable the new build trigger before an approved rollback.
Supabase ownership, W10 authority activation and #1086 remain outside this migration.

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

Legacy-route retirement completed before the separately approved source cutover recorded above.
Its historical sequence was:

1. Remove the six redundant/health routes while retaining the ten legacy bindings. Deploy and
   verify the Pages retirement handler and its compiled host/path/method boundary before removing
   the legacy routes. Anonymous previews do not prove apex-only production retirement.
2. Keep the canonical www redirect: www legacy calls receive 308 and then the apex 410; valid
   browser preflights receive 204 on the apex. See [www outcome](#www-outcome).
3. Remove the ten legacy Worker bindings by exact route ID, leaving only
   `api.tarkovtracker.org/*`. The current API-owned `wrangler.toml` records that sole Worker route;
   Tracker owns the Pages retirement middleware and has no gateway deployment configuration.
4. Verify the [retired HTTP contract](./api.md#progress-api-host-apitarkovtrackerorg), including
   query/trailing-slash variants and redirect boundaries, plus API `/health` and first-party Pages
   routes. Apex `/health` remains a Pages 404; www redirects to that response.

The broad historical Worker `token*`/`progress*` patterns also intercept unrelated
suffixes; after removal those return to normal frontend
routing, while retirement remains precisely slash-delimited. These changes do not alter DNS,
credentials, Worker identity, DO namespaces/state, or unrelated routing.

If Pages retirement regresses, an explicitly approved emergency route rollback can restore only
the retained ten legacy bindings in the API-owned configuration while Pages is repaired. Use the
retained historical config rather than a deleted Tracker directory; never restore the six
redundant/health bindings. This does not undo the completed source cutover or authorize a new
source change.

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
