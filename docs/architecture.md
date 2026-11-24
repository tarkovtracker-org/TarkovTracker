# TarkovTracker Architecture

[AGENTS.md](../AGENTS.md) maps the repository. [Systems](systems/README.md) owns runtime behavior.
[package.json](../package.json) owns installed versions, and [API ownership](api-ownership.md)
defines the boundary with the separate public gateway.

## Public rendering and discovery

[`nuxt.config.ts`](../nuxt.config.ts) enables rendering but defaults application routes to
client rendering. The explicit public inventory in [`routeSeo.ts`](../app/utils/routeSeo.ts)
opts into prerendering; link crawling is disabled and missing required documents fail the build.
Payload extraction is off: prerendered documents inline their Nuxt payload because
`_payload.json` URLs match the client-rendered catch-all and would return HTML; a required public
or client document that references one fails the build.
The `pages:extend` hook maps public routes to wrappers in `app/features/seo-pages/` and keeps the
tracker modules in `app/pages/`. Most tracker wrappers pass their header through the module's
`header` slot and render the same header in the prerendered fallback. The hideout wrapper renders
its header and English PvP station requirements above the client-only tracker. Each station and
level has a fragment target in the initial HTML, so links can open the reference before hydration.
Resource guides render their full article. Navigation, personal state, supporter checkout,
changelog requests, and application initialization run only in the browser. English HTML hydrates
before saved/browser locale selection; initialization mounts once per application.

The same registry owns canonical `.org` URLs, indexing directives, descriptions, social tags,
structured data, and sitemap membership. Filter queries and fragments never enter canonicals.
Finite settings/account/auth/team/admin/profile shells contain initial `noindex`; robots.txt allows
crawlers to read that directive while excluding API and overlay paths. A bounded profile Function
validates UUID/mode paths and reads the static profile shell without querying a database.
`index.html` stays the prerendered homepage; top-level `404.html` gives unknown paths and invalid
resource slugs real 404 responses. Legacy aliases remain HTTP 301 redirects.

Preview title, card, and image-tag behavior is implemented in
[`routeSeo.ts`](../app/utils/routeSeo.ts). The global `theme-color` is configured in
[`nuxt.config.ts`](../nuxt.config.ts). Guide image settings are declared in
[`resourceData.ts`](../app/features/resources/resourceData.ts).

The [prerender validator](../app/utils/prerenderOutput.ts) checks initial link-preview metadata
at build time. The [SEO preview smoke suite](../scripts/preview/smoke/seo.smoke.mjs) checks deployed
documents and metadata changes during navigation.

Use [Discord's Embed Debugger](https://discord.com/developers/embeds) while signed in to inspect
Discord's actual selected tags and layout. Previews are cached for about 30 minutes; append a fresh
`?v=<revision>` when testing changed cards. The [link-preview reference](https://docs.discord.com/developers/link-previews/overview)
defines the fetch requirements, supported layouts, limits, and cache behavior. Do not treat an
HTML check or a local mockup as evidence of Discord's rendered card.

## Settings navigation

Settings applies hash scrolls immediately while the page is mounted. Both the page and Nuxt can
handle a hash change, so the page also disables inherited smooth scrolling for Nuxt's scroll.

The [player-level field](../app/features/settings/PlayerLevelField.vue) reserves the translated
loading hint's height while displaying the current range hint. Loading level metadata can shorten
that hint; keeping its footprint stable prevents nested `#skills` links below it from moving under
the fixed header after scrolling. The hidden reservation is excluded from assistive output. Existing
route scrolling, aliases, refresh and Back/Forward behavior stay in
[`settings.vue`](../app/pages/settings.vue). The settings navigation
[browser smoke test](../scripts/preview/smoke/settings-navigation.smoke.mjs) covers the metadata
transition and verifies geometry after scrolling settles.

## State management

| Store                 | Responsibility                                          |
| --------------------- | ------------------------------------------------------- |
| `useTarkovStore`      | Player progress, persistence and sync                   |
| `useMetadataStore`    | Mode-scoped game data and localized views               |
| `usePreferencesStore` | UI and account preferences                              |
| `useProgressStore`    | Computed facade over progress, metadata and preferences |

See [storage](systems/progress-storage.md), [synchronization](systems/progress-sync.md),
[game data](systems/game-data.md), [imports](systems/imports.md) and [teams](systems/teams.md).

## Authentication

Supabase provides OAuth and email authentication. The login popup polls every 500 ms, redirects
after 3 seconds only if the popup was never observed open, and abandons after 90 seconds.
A same-origin success message clears timers/listeners and navigates to a safe target. Client
initialization, session reads and refreshes are single-flight per browser client. Protected requests
reuse the current JWT. Team routes check membership.

## API architecture

[Game-data contracts](systems/game-data.md) own endpoint scopes and cache behavior.
The [browser verification proposal](tarkov-clearance-rollout.md) owns the Cloudflare gates.
The client shares clearance probes and renewals, checks `cf-mitigated` before JSON parsing, and
retries a challenged request once. One caller's abort does not cancel other waiters. IndexedDB
hits are independent. Only challenged callers wait for manual retry. Dismissing the gate rejects
them until verification is retried. A failed ordinary probe is retried on the next request.
Verification follows `Retry-After`; after recovery, metadata and open shared profiles reload.
Shared-profile request deadlines start after access is released. Server callers and direct public
reads do not use the client gate.

### API protection

`nuxt.config.ts` defines public route exceptions and the proxy-trust default.
`app/server/middleware/api-protection.ts` applies host, trusted-IP and authentication policy.
See the [environment variables](#environment-variables) and [rate-limit owners](rate-limiting.md).

## Deployment

Cloudflare Pages builds from the repository root using `pnpm run build` on Node 24.x and publishes
`dist`. Pages can derive pnpm from `packageManager`; an explicit `PNPM_VERSION` is `11.14.0`.
See [public rendering](#public-rendering-and-discovery) for the static/dynamic split and the
[runbook](runbook.md#deployment) for operational checks.

### Environment Variables

Browser-clearance settings:

- `NUXT_PUBLIC_TARKOV_ACCESS_ENABLED`: explicitly enable browser coordination per environment.
- `NUXT_PUBLIC_TARKOV_ACCESS_SITE_KEY`: dedicated widget public sitekey.
- `NUXT_TARKOV_ACCESS_SECRET_KEY`: server-only dedicated widget secret.
- `NUXT_TARKOV_ACCESS_EXPECTED_HOSTNAMES`: comma-separated exact hostname allowlist.
- `NUXT_TARKOV_VERIFY_RATE_LIMIT_PER_MINUTE`: verification-endpoint limit, default 10.
- `PREVIEW_ACCESS_CLIENT_ID` / `PREVIEW_ACCESS_CLIENT_SECRET`: trusted smoke-runner secrets,
  never application/build environment variables.
- `TARKOV_OPERATIONS_ORIGIN` and `TARKOV_OPERATIONS_CLIENT_ID` / `TARKOV_OPERATIONS_CLIENT_SECRET`:
  overlay-verification runner configuration for an approved Access-protected operations host;
  credentials are refused unless the origin is set explicitly.

Production and protected staging require distinct reviewed widget configuration; ordinary
local/preview builds leave the browser gate disabled. See the
[rollout gates](./tarkov-clearance-rollout.md) before changing these values.

Naming convention: `SUPABASE_*` for shared Supabase project settings, `NUXT_*` for Nuxt private
runtime config (server-only), `NUXT_PUBLIC_*` for Nuxt public runtime config (browser-exposed), and
plain names for platform/build-time or Supabase Edge Function settings.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are the canonical shared Supabase values. Nuxt, Cloudflare
Pages/Workers, and Supabase Edge Functions can all consume them, so they must not be duplicated as
`NUXT_PUBLIC_*` or `VITE_*` values.

Full resolution logic is in `app/utils/runtimeConfig.ts`.

### Environment value entry standard

Quote syntax depends on where a value is entered:

- In `wrangler.toml`, write string values as TOML strings, for example
  `APP_URL = "https://tarkovtracker.org"`. The TOML parser treats the quotation marks as syntax;
  they are not part of the resulting value.
- In `.env`, `.env.*`, and `.dev.vars*` files, use unquoted values by default, for example
  `APP_URL=https://tarkovtracker.org`. Dotenv permits both quoted and unquoted values, but matching
  dashboard entry style reduces copy/paste mistakes. Add quotes only when they are semantically
  required, such as preserving leading or trailing whitespace, including `#` as data, or expressing
  a supported multiline value.
- In a Cloudflare Pages or Workers dashboard **Value** field, enter only the raw value, for example
  `https://tarkovtracker.org`. Cloudflare stores and passes dashboard values as entered; quotation
  marks typed into the field become part of the value.
- At an interactive `wrangler secret put` value prompt, enter only the raw secret. Shell quotes used
  around command arguments are shell syntax, but quotation marks pasted or piped as secret content
  are data and are preserved.
- Never place private credentials in `[vars]` or commit them to `wrangler.toml`. Store them as
  encrypted Cloudflare secrets. It is safe for intentionally public identifiers such as the
  Supabase anon key and Turnstile sitekey to remain plaintext configuration.

Therefore, TOML strings stay quoted because TOML requires a string delimiter. Dotenv and dashboard
values stay unquoted unless the dotenv value specifically requires quoting. Interactive secret
fields never include decorative wrapping quotes.

References: Cloudflare's Pages bindings and Workers secrets documentation, Cloudflare's Pages API
(`env_vars.*.value` is the stored string), Node.js's dotenv specification, and TOML v1.0.

Cloudflare Pages production and preview configuration is sourced from `wrangler.toml`. Dashboard
entries are reserved for encrypted secrets; do not duplicate plaintext `[vars]` there. Smart
Placement is enabled for both environments through the top-level `[placement]` block.

**Client-side (browser) — Nuxt public runtime config:**

| Variable                                         | Description                                                                                         | Required |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | -------- |
| `SUPABASE_URL`                                   | Shared Supabase project URL for auth and sync                                                       | Yes¹     |
| `SUPABASE_ANON_KEY`                              | Shared Supabase anon key for auth and sync                                                          | Yes¹     |
| `NUXT_PUBLIC_PROGRESS_DIAGNOSTIC_SINK_URL`       | Optional aggregate progress byte/count collector; independent of general logs (disabled by default) | No       |
| `NUXT_PUBLIC_CLIENT_LOG_SINK_URL`                | Optional browser log collector URL (disabled by default)                                            | No       |
| `NUXT_PUBLIC_LOG_LEVEL`                          | Client log level (debug, info, warn, error)                                                         | No       |
| `NUXT_PUBLIC_TURNSTILE_SITE_KEY`                 | Turnstile widget sitekey for Tarkov.dev profile imports                                             | No²      |
| `NUXT_PUBLIC_TARKOV_DEV_IMPORT_COOLDOWN_MINUTES` | Browser cooldown after a confirmed profile import                                                   | No       |

> **¹ Required in production.** These shared names are consumed by Nuxt, Pages, Workers, and Edge
> Functions. Without Supabase configuration, auth, sync, realtime, and team features are unavailable;
> the app runs in offline mode with localStorage only.
>
> **² Turnstile is optional, but its public sitekey and private secret must be configured together.
> Local development uses Cloudflare's always-pass test keys automatically.**

`VITE_PERF_DEBUG` is an opt-in client performance debugging switch. Set it to `1`, `true`, `yes`,
or `on` before starting the dev server or building the app to enable timing logs from
`app/utils/perf.ts` through the shared client logger. Leave it unset or set it to `false` for normal
builds. This is a Vite build-time variable, not Nuxt runtime configuration.

**Server-side (Nuxt private runtime config and direct process environment):**

| Variable                                        | Description                                                     | Required   |
| ----------------------------------------------- | --------------------------------------------------------------- | ---------- |
| `NUXT_SUPABASE_SERVICE_KEY`                     | Supabase service role key                                       | Yes (prod) |
| `NUXT_TARKOV_JSON_BASE_URL`                     | Static game-data JSON base URL override                         | No         |
| `NUXT_LOG_SINK_URL`                             | Centralized server log sink (HTTPS)                             | No         |
| `NUXT_TWITCH_CLIENT_ID`                         | Twitch API client ID                                            | No         |
| `NUXT_GITHUB_CONTRIBUTORS_EXCLUDE`              | Bot accounts excluded from contributors                         | No         |
| `NUXT_GITHUB_TIMEOUT_MS`                        | GitHub API timeout                                              | No         |
| `NUXT_GITHUB_TOKEN`                             | GitHub API token                                                | No         |
| `OVERLAY_TOKEN`                                 | Read-only Contents token scoped to `tarkov-data-overlay`        | Yes        |
| `NUXT_CACHE_BYPASS_ENABLED`                     | Enable server-side cache bypass header                          | No         |
| `API_ALLOWED_HOSTS`                             | Allowed origin hosts                                            | No         |
| `API_TRUSTED_IP_RANGES`                         | Trusted IP ranges (CIDR)                                        | No         |
| `API_REQUIRE_AUTH`                              | Require auth for protected routes (default true)                | No         |
| `API_PUBLIC_ROUTES`                             | Routes exempt from auth (the Siteverify relay is always public) | No         |
| `API_TRUST_PROXY`                               | Trust proxy headers (auto-detected on Cloudflare)               | No         |
| `STRIPE_SECRET_KEY`                             | Stripe API secret key                                           | Yes (prod) |
| `STRIPE_PRICE_SCAV_MONTHLY`                     | Stripe price ID for Scav monthly plan                           | Yes (prod) |
| `STRIPE_PRICE_SCAV_6MONTH`                      | Stripe price ID for Scav 6-month plan                           | Yes (prod) |
| `STRIPE_PRICE_SCAV_YEARLY`                      | Stripe price ID for Scav yearly plan                            | Yes (prod) |
| `STRIPE_PRICE_TIMMY_MONTHLY`                    | Stripe price ID for Timmy monthly plan                          | Yes (prod) |
| `STRIPE_PRICE_TIMMY_6MONTH`                     | Stripe price ID for Timmy 6-month plan                          | Yes (prod) |
| `STRIPE_PRICE_TIMMY_YEARLY`                     | Stripe price ID for Timmy yearly plan                           | Yes (prod) |
| `STRIPE_PRICE_CHAD_MONTHLY`                     | Stripe price ID for Chad monthly plan                           | Yes (prod) |
| `STRIPE_PRICE_CHAD_6MONTH`                      | Stripe price ID for Chad 6-month plan                           | Yes (prod) |
| `STRIPE_PRICE_CHAD_YEARLY`                      | Stripe price ID for Chad yearly plan                            | Yes (prod) |
| `NUXT_ACCOUNT_IP_HASH_SECRET`                   | HMAC secret for account-level IP audit records                  | Yes (prod) |
| `NUXT_TARKOV_DEV_PROFILE_CACHE_TTL_MS`          | Tarkov.dev profile shared-cache TTL in milliseconds             | No         |
| `NUXT_TARKOV_DEV_PROFILE_RATE_LIMIT_PER_MINUTE` | Per-IP profile-import requests per minute                       | No         |
| `NUXT_TARKOV_DEV_PROFILE_RATE_LIMIT_PER_HOUR`   | Per-IP profile-import requests per hour                         | No         |
| `NUXT_TARKOV_DEV_PROFILE_MAX_UPDATED_AGE_DAYS`  | Reject older profile snapshots; `0` disables                    | No         |
| `NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`       | Per-IP team-members requests per minute                         | No         |
| `NUXT_TEAM_MEMBERS_CACHE_TTL_MS`                | Team-members shared-cache TTL in milliseconds                   | No         |
| `NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`     | Per-IP shared-profile requests per minute                       | No         |
| `NUXT_SHARED_PROFILE_CACHE_TTL_MS`              | Shared-profile shared-cache TTL in milliseconds                 | No         |
| `NUXT_TURNSTILE_SECRET_KEY`                     | Server-side Turnstile secret for profile imports                | No²        |

`OVERLAY_TOKEN` is required for private overlay fetches in production, previews, precompute, and
local/operator checks such as `pnpm run verify:overlay`. Server and precompute consumers read it
directly from the process environment; see
[overlay authentication](systems/overlay-and-precompute.md#invariants).

**Build-time / platform:**

| Variable             | Description                            |
| -------------------- | -------------------------------------- |
| `APP_URL`            | Canonical production application URL   |
| `CF_PAGES_URL`       | Automatic Cloudflare Pages preview URL |
| `GA_MEASUREMENT_ID`  | Google Analytics measurement ID        |
| `CLARITY_PROJECT_ID` | Microsoft Clarity project ID           |
| `VITE_PERF_DEBUG`    | Client performance timing logs         |

**Analytics privacy:** When analytics integrations are enabled and the Clarity project ID
is valid, Microsoft Clarity skips documents on `/oauth`, `/oauth/*`, and `/auth/callback`
(including encoded or case-varied paths). It also skips URLs with credential query or
hash parameters, including Discord linking callbacks on `/settings`, and documents
whose same-origin referrer contains one of these sensitive URLs. Malformed URLs also
skip recording and do not install the router guard, allowing Nuxt's forced initial
route replacement to finish without reloading the document. On recorded documents,
the router guard starts a native full page navigation and cancels the
SPA navigation. If only the fragment changes on the current path and query, it appends
the existing `_tt_retry` cache-busting parameter to force a new document. This keeps
the sensitive destination out of the current recorder's
`pushState`/`replaceState` hooks. The destination still appears in normal browser
navigation history; its new document skips Clarity. Consent denial alone does not
prevent URL/referrer collection. Ordinary routes retain SPA navigation and the existing
analytics consent flow. Skipped documents remain unrecorded until a full page load
with a benign URL and referrer.

**Supabase Edge Functions** (set in Supabase Dashboard, not Cloudflare Pages):

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are platform-managed canonical
Edge Function values. Nuxt uses `NUXT_SUPABASE_SERVICE_KEY` for the privileged key. `APP_URL` is the
canonical application URL used by `admin-cache-purge`; it has no alias fallback.
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are shared canonical names used by both Nuxt and
Edge Functions. `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_SUPPORTER_ROLE_ID`,
`DISCORD_LINKED_ROLE_ID`, `CLOUDFLARE_ZONE_ID`, and `CLOUDFLARE_API_TOKEN` are Edge-only.
`DISCORD_SCAV_ROLE_ID`, `DISCORD_TIMMY_ROLE_ID`, and `DISCORD_CHAD_ROLE_ID` are optional
Edge-only tier roles for supporter sync (role sync skips the tier role when one is unset). See
`supabase/functions/.env.example`.

**Cloudflare Workers** (TarkovTracker-API, set via `wrangler secret put` in that checkout):

| Variable                    | Description                                                    | Required   |
| --------------------------- | -------------------------------------------------------------- | ---------- |
| `SUPABASE_URL`              | Supabase project URL                                           | Yes        |
| `SUPABASE_ANON_KEY`         | Supabase anon key                                              | Yes        |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key                                      | Yes        |
| `IP_HASH_SECRET`            | HMAC secret for pseudo-anonymizing IPs in abuse-gate log lines | Yes (prod) |
