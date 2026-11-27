# TarkovTracker API Documentation

<!-- AGENT QUICK REFERENCE
Progress API host: api.tarkovtracker.org (Bearer api_token auth).
Internal routes: /api/tarkov/* (cached game-data proxy, NOT a public integration surface).
Team routes: /api/team/* (Supabase JWT auth).
Profile routes: /api/profile/* (public, rate-limited — no auth for shared profiles).

Game modes in API: regular (pvp), pve, pvp-season (seasonal).
Rate limits: §Rate Limits. OpenAPI spec: [API source](https://github.com/tarkovtracker-org/TarkovTracker-API/blob/v0.1.2/src/openapi.ts).
-->

## Overview

TarkovTracker provides internal API routes for fetching game data and team information. Game data is proxied through Nuxt server routes to `json.tarkov.dev` with caching and overlay corrections applied.
Set `NUXT_TARKOV_JSON_BASE_URL` to point static game-data requests at a compatible `json.tarkov.dev` mirror.

For nonowners, missing and nonpublic profiles return the same generic `404 Profile not found`
response. Streamer/overlay consumers preserve that response so sharing endpoints do not expose
whether a candidate account or private mode exists. Owners can still view their private progress.

### Profile links

Players can claim or change a handle in **Settings → Account → Profile Sharing**.
The first change is available immediately. Further changes have a 30-day cooldown.
A rename immediately frees the old handle for others to claim. Old handle links stop
resolving to the previous owner and may later resolve to a new owner.
Players can also opt in to a supporter badge from **Profile Sharing**. Eligible shared profiles
expose only the badge label as `supporterBadge` (`supporter` or `active_subscriber`).
The badge respects each mode's sharing visibility and is hidden in Streamer Mode.
The short `/@<handle>` link chooses public PvP, then public PvE, then the public
active Seasonal profile. Use `/@<handle>/<mode>` to link to a specific mode.
Existing `/profile/<uuid>/<mode>` links keep their current access rules. Claims
do not change visibility. Handle links require public mode visibility and are
disabled while Streamer Mode is enabled. Deleted accounts leave their former
addresses reserved so old links cannot be reassigned to a different player.

> **Upstream data source.** TarkovTracker consumes the static JSON endpoints at `json.tarkov.dev`.
> The endpoint catalog lives at `https://json.tarkov.dev/endpoints`. The older `api.tarkov.dev`
> GraphQL playground is deprecated and unstable; do not use it for game data or external tooling.

## Base URL

- **Internal Site API (dev):** `http://localhost:3000/api`
- **Internal Site API (prod):** `https://tarkovtracker.org/api`
- **Progress API Gateway:** `https://api.tarkovtracker.org`

## Progress API Host (api.tarkovtracker.org)

The functional progress API gateway (token, progress, team progress) is served exclusively on
`https://api.tarkovtracker.org` (clean paths, with `/api/v2/*` accepted as a path alias on the
subdomain). On exactly `tarkovtracker.org` and `www.tarkovtracker.org`, the legacy families
`/api/v2`, `/api/token`, `/api/progress` and `/api/team/progress` (each exact path or slash-delimited
descendant) are retired. Pages returns HTTP **410 Gone** with static JSON:

```json
{
  "error": "legacy_api_retired",
  "message": "This legacy API address has been retired. Update your API base URL to https://api.tarkovtracker.org. See the documentation for migration instructions.",
  "api_base_url": "https://api.tarkovtracker.org",
  "documentation_url": "https://api.tarkovtracker.org/"
}
```

The Pages entry wrapper returns before Nitro buffers a request body. The early retirement
middleware uses the same response helper before API protection in other Nitro runtimes.
Retirement authenticates nothing, reads no submitted body, and performs no outbound requests
or binding calls. Responses use `no-store`;
HEAD has no body. Valid browser preflight returns 204, allowing GET, HEAD, POST, PUT, PATCH,
DELETE and OPTIONS with Accept, Authorization, Content-Type, If-None-Match and User-Agent.
Wildcard CORS applies only to this static response, without credential support. The Pages
response has no redirect, Location or Retry-After. Other hosts and first-party frontend routes keep their
existing behavior, including `/api/tarkov/*`; near prefixes such as `/api/v20` are unaffected.

These responses come directly from the apex. The apex/www Worker bindings for these families are
removed; the API Worker binds only `api.tarkovtracker.org/*`. On `www.tarkovtracker.org`, the
Cloudflare canonical redirect answers first with 308 to the same apex path and query, which then
returns the 410/204 above; a 308 preserves method and body. Browsers do not follow redirects for
preflights, so cross-origin browser calls to www fail CORS instead of reading the 410. Compiled
tests bypass edge redirects.
See [the retirement record](./api-ownership.md#legacy-address-retirement).

Third-party integrations call `api.tarkovtracker.org` directly:

```diff
-POST https://tarkovtracker.org/api/v2/progress/task/{taskId}
+POST https://api.tarkovtracker.org/progress/task/{taskId}
```

## Authentication

Tarkov data endpoints (`/api/tarkov/*`) are unauthenticated. Team endpoints require Supabase authentication.

```http
Authorization: Bearer <supabase_jwt_token>
```

## Tarkov Data Endpoints

These are internal browser-app endpoints, not a supported external game-data API.
Integrations should use `https://json.tarkov.dev`. Anonymous visitors remain supported;
optional browser-verification recovery is disabled by default. Enforcement requires the
separate [Cloudflare rollout](./tarkov-clearance-rollout.md), not merely deploying this code.
The progress API at `api.tarkovtracker.org` is outside this change.

`GET /api/tarkov/access-check` is a lightweight, `no-store` probe with no upstream or database
calls. Cloudflare must challenge it under the same rule as data endpoints. A permitted probe
returns `{ "ok": true }`; it does not issue clearance.

`POST /api/security/tarkov-verify` accepts JSON `{ "token": "..." }` without login or existing
clearance. It is size-limited (a runtime that cannot stream the body refuses one without
`Content-Length` with 411), rate-limited and never cached. The dedicated strict verifier
checks Siteverify success, exact configured hostname and `tarkov_data_access` action; invalid
requests/tokens receive 4xx, outages or incomplete configuration receive 503. After success
the browser must repeat the protected probe. Existing profile-import verification policy is
unchanged. See [handler](../app/server/api/security/tarkov-verify.post.ts).

> **First-party routes, not a third-party API.** `/api/tarkov/*` exists to serve game data to the
> TarkovTracker site itself. It is not a supported integration surface, carries no compatibility
> guarantee, and its response shape can change in any release. Third-party clients should read game
> data from `json.tarkov.dev` directly, or use the progress API at `https://api.tarkovtracker.org`
> (see [Progress API Host](#progress-api-host-apitarkovtrackerorg)).
>
> These routes are public and pass through the API protection middleware; see
> [`architecture.md#api-protection`](./architecture.md#api-protection) for access-control configuration and
> [`rate-limiting.md`](./rate-limiting.md) for rate-limit ownership.

### Neutral catalog responses

The ten hot datasets are language-neutral snapshots scoped by `gameMode`. Their
names, descriptions, and localized links can be `@tt:` references. Load
`/api/tarkov/strings?lang=<code>` and resolve those references before rendering,
searching, or sorting by text. Entity IDs and object keys retain their identities.

Catalog and strings responses use `Cache-Control: no-store`,
`X-Cache-Status: PRECOMPUTE`, and `X-Catalog-Release: <completedAt>`. Overlay-bearing
scopes also expose overlay headers and `dataOverlay`. Bootstrap and map-spawns
have no overlay body identity. A KV failure can serve an eligible last-good
compressed Cache API snapshot with `X-Cache-Status: STALE`; without one the route
returns `503`. Release verification requires the active precomputed release.

### GET /api/tarkov/strings

Returns `{ data: { strings: { "<reference>": "<resolved text>" } }, dataOverlay }`.
The table contains referenced keys for every mode and endpoint, with English
fallback resolved on the server. Its scope is API language and its release follows
the shared snapshot policy. `gameMode` does not select a separate table.

| Parameter | Type   | Default | Description                                                              |
| --------- | ------ | ------- | ------------------------------------------------------------------------ |
| `lang`    | string | `en`    | Selectable API language, with unsupported values falling back to English |

### GET /api/tarkov/bootstrap

Fetches minimal player level data for early UI rendering.

**Query Parameters**

| Parameter  | Type   | Default   | Description                       |
| ---------- | ------ | --------- | --------------------------------- |
| `gameMode` | string | `regular` | `regular`, `pve`, or `pvp-season` |

**Response:**

```json
{
  "data": {
    "playerLevels": [
      { "level": 1, "exp": 0 },
      { "level": 2, "exp": 1000 }
    ]
  }
}
```

---

### GET /api/tarkov/tasks-core

Fetches core task data (tasks, maps, traders) without objectives or rewards. The optional
`maps[].bossSpawns` projection includes encounter probabilities and conditional location
probabilities as fractions. Location positions can be empty.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Response:**

```json
{
  "data": {
    "tasks": [
      {
        "id": "5936d90786f7742b1420ba5b",
        "name": "@tt:regular:tasks:5936d90786f7742b1420ba5b name",
        "trader": { "id": "...", "name": "@tt:regular:traders:..." },
        "map": { "id": "...", "name": "@tt:regular:maps:..." },
        "experience": 1500,
        "minPlayerLevel": 1
      }
    ],
    "maps": [
      { "id": "55f2d3fd4bdc2d5f408b4567", "name": "@tt:regular:maps:55f2d3fd4bdc2d5f408b4567 Name" }
    ],
    "traders": [
      {
        "id": "54cb50c76803fa8b248b4571",
        "name": "@tt:regular:traders:54cb50c76803fa8b248b4571 Nickname"
      }
    ]
  }
}
```

---

### GET /api/tarkov/tasks-objectives

Fetches task objectives and fail conditions.

**Query Parameters:**

| Parameter  | Type   | Default      | Description                                         |
| ---------- | ------ | ------------ | --------------------------------------------------- |
| `gameMode` | string | `regular`    | Game mode (`regular`, `pve`, or `pvp-season`)       |
| `view`     | string | Full catalog | Use `counts` for task and objective IDs with counts |

The published snapshot includes overlay provenance. A missing snapshot without an
eligible last-good copy returns `503`. A KV-failure fallback is marked `STALE`.

The counts view retains overlay provenance. Releases published before this view
was introduced return the full payload.

---

### GET /api/tarkov/tasks-import

Whole English task catalog used by EFT log import, read only from the precomputed snapshot
(`tasks-import-json-v1-en-<gameMode>`). There is no runtime generation or language parameter.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Caching:** `Cache-Control: no-store`. Missing, corrupt, wrong-mode or expired snapshots return
`503`. Seeding and verification: [overlay and precompute](systems/overlay-and-precompute.md#release-verification).

---

### GET /api/tarkov/tasks-rewards

Fetches task rewards (start, finish, failure).

A new precompute manifest publishes corrected rewards. The admin Tarkov data purge
invalidates the browser's neutral metadata and strings after publication.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

---

### GET /api/tarkov/hideout

Fetches hideout stations with levels, requirements, and crafts.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

---

### GET /api/tarkov/items-lite

Fetches lightweight item data (id, name, shortName, image).

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

---

### GET /api/tarkov/items

Fetches full item data including properties.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

---

### GET /api/tarkov/prestige

Fetches prestige level requirements.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

Prestige requirements come from the upstream mode's task payload with overlay
corrections applied. Display fields resolve through the selected strings bundle.

---

### GET /api/tarkov/extract-requirements

Returns the overlay's extract requirement rules (`extractRequirements`, generated from the game
client's location and global definitions) and curated scene cues (`extractCues`) for every mode
as `{ data: { requirements, cues } | null, dataOverlay }`. `data` is null until the overlay
publishes both sections in a valid shape. Takes no query parameters. Returns `503` when no overlay
is available; successful responses use `Cache-Control: no-cache`. Shapes:
`app/utils/extractRuleData.ts`; consumer: [tasks](systems/tasks.md#extract-requirement-cues-and-details).

---

### GET /api/tarkov/editions

Fetches mode-scoped game editions and story chapters from the overlay. In `pvp-season`, seasonal
perk metadata comes from the neutral `json.tarkov.dev/pvp-season/season` catalog, augmented by
overlay effects matched by perk ID. All upstream perks are retained, including perks without an
effect patch. Other modes return an empty seasonal perk list.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

Seasonal membership and metadata are validated during precompute, and effect
patches augment existing perk IDs. The neutral snapshot retains mode-scoped text
references. An incompatible source prevents release activation and retains the
previous complete manifest. Responses follow the shared neutral snapshot policy.

---

### GET /api/tarkov/overlay-status

Returns the activated neutral release manifest with `completedAt`, `overlaySha`,
and exactly 46 entries covering 30 mode catalogs, 3 objective count views, and
13 language bundles. Each entry records its immutable object key, uncompressed
byte length, and overlay response headers. `verify:overlay` compares every served response against this
manifest and the freshly published overlay, then checks English imports separately.

This endpoint takes no query parameters. Responses use `Cache-Control: no-store`
and have no `X-Cache-Status` header. Missing or unreadable manifests return `503`.

---

### GET /api/tarkov/map-spawns

Fetches map spawn point data.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

---

### GET /api/tarkov/cache-meta

Fetches cache purge timestamp to detect server-side cache clears.

**Response:**

```json
{
  "data": {
    "lastPurgeAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Cache-Control:** `public, max-age=0, must-revalidate` for clients; the Cloudflare CDN may serve
the purge timestamp for up to 360s total (300s fresh plus up to 60s stale while revalidating
in the background), so clients relying on `lastPurgeAt` can detect a purge up to ~6 minutes late
(`Cloudflare-CDN-Cache-Control: public, max-age=300, stale-while-revalidate=60`).

---

## Team Endpoints

### GET /api/team/members

Fetches team member profiles. Requires authentication.

**Query Parameters:**

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `teamId`  | string | Yes      | Team UUID   |

**Headers:**

```http
Authorization: Bearer <supabase_jwt_token>
```

**Response:**

```json
{
  "members": ["user-uuid-1", "user-uuid-2"],
  "profiles": {
    "user-uuid-1": {
      "displayName": "Player1",
      "level": 45,
      "tasksCompleted": 120,
      "gameEdition": 4,
      "gameMode": "seasonal"
    }
  }
}
```

**Errors:**

| Status | Message            | Cause                    |
| ------ | ------------------ | ------------------------ |
| 400    | teamId is required | Missing teamId parameter |
| 401    | Missing auth token | No Authorization header  |
| 401    | Invalid token      | Invalid or expired JWT   |
| 403    | Not a team member  | User not in team         |

### Team mutation Edge Functions

Team mutations are invoked with an authenticated Supabase JWT through the client composable. The
`team-disband` operation is owner-only and removes the team, memberships, and team-owned records in
one database transaction after confirmation in the UI.

| Function       | Purpose                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| `team-create`  | Create a team and its owner membership; join code must be 12–255 characters |
| `team-join`    | Join a team with an invite code                                             |
| `team-leave`   | Leave a team as a non-owner                                                 |
| `team-kick`    | Remove a member as the owner                                                |
| `team-disband` | Atomically remove an owned team                                             |

---

## Supporter / Stripe Endpoints

### POST /api/stripe/checkout

Creates a Stripe Checkout session for a first supporter subscription or a one-time payment.
Existing active or past-due subscribers must use `/api/stripe/portal` to change plans. Requires
authentication.

**Request Body (subscription):**

```json
{
  "mode": "subscription",
  "tier": "scav",
  "interval": "monthly"
}
```

**Request Body (one-time payment):**

```json
{
  "mode": "payment",
  "amount": 10
}
```

| Field               | Type   | Required     | Description                                            |
| ------------------- | ------ | ------------ | ------------------------------------------------------ |
| `mode`              | string | Yes          | `subscription` or `payment`                            |
| `tier`              | string | Subscription | `scav`, `timmy`, or `chad`                             |
| `interval`          | string | Subscription | `monthly`, `6month`, or `yearly`                       |
| `amount`            | number | One-time     | USD amount (min 4, max 520)                            |
| `checkoutAttemptId` | string | Optional     | Lowercase UUID v4 that identifies one checkout attempt |

Retry an unresolved attempt for the same selection with the same ID for up to 24 hours. Use a new
ID when the selection changes or after receiving a successful response. The server scopes the key
to the authenticated user. If the billing lookup is unavailable, a keyed request returns 503
before creating a session.

**Response:**

```json
{ "url": "https://checkout.stripe.com/c/pay/..." }
```

**Errors:**

| Status | Message                                                 | Cause                                        |
| ------ | ------------------------------------------------------- | -------------------------------------------- |
| 400    | Invalid tier / Invalid interval                         | Bad request body                             |
| 401    | Authentication required                                 | Missing or invalid session                   |
| 409    | Manage your existing subscription in the billing portal | Active or past-due subscription exists       |
| 500    | Stripe not configured                                   | Server missing Stripe keys                   |
| 502    | Failed to create checkout session                       | Stripe API error                             |
| 503    | Unable to verify Stripe billing state                   | Supabase billing-state lookup is unavailable |

---

### POST /api/stripe/portal

Creates a Stripe Customer Portal session so an authenticated subscriber can manage their subscription, payment method, or view invoices. Requires authentication and an existing Stripe customer linked to the user (via the `supporters` table).

**Request Body:**

```json
{ "returnUrl": "https://tarkovtracker.org/supporter" }
```

| Field       | Type   | Required | Description                                                                                |
| ----------- | ------ | -------- | ------------------------------------------------------------------------------------------ |
| `returnUrl` | string | No       | Absolute URL on the configured app origin to send the user back to. Defaults to /supporter |

The `returnUrl` host must match the configured app URL host. Mismatched hosts fall back to `${appUrl}/supporter` to prevent open-redirect abuse.

**Response:**

```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

**Errors:**

| Status | Message                                 | Cause                                            |
| ------ | --------------------------------------- | ------------------------------------------------ |
| 401    | Authentication required                 | Missing or invalid session                       |
| 404    | No Stripe customer found                | User has never paid; no `stripe_customer_id` row |
| 500    | Stripe not configured                   | Server missing Stripe keys                       |
| 502    | Failed to create billing portal session | Stripe API error                                 |

---

## Progress Task Lifecycle

Task writes on `api.tarkovtracker.org` accept four states through both
`POST /progress/task/{taskId}` and `POST /progress/tasks`:

| State         | Stored `complete` | Stored `failed` | Stored `active` |
| ------------- | ----------------- | --------------- | --------------- |
| `active`      | `false`           | `false`         | `true`          |
| `completed`   | `true`            | `false`         | `false`         |
| `failed`      | `true`            | `true`          | `false`         |
| `uncompleted` | `false`           | `false`         | `false`         |

Use `active` when the player has accepted an ordinary task. Task writes store only the task IDs
explicitly requested by the caller; an unlocked successor with no stored progress stays absent from
the progress object. Clients derive availability from the task requirements and current progress,
so the gateway does not write a stale neutral successor over a concurrent or explicit update.
Completing, failing, or uncompleting a task clears `active`.

Single-task request:

```json
{ "state": "active" }
```

Batch request:

```json
[
  { "id": "task-1", "state": "active" },
  { "id": "task-2", "state": "completed" }
]
```

The legacy direct object-map form remains supported for compatibility:

```json
{ "task-1": "active", "task-2": "completed" }
```

`GET /progress` may include `active: true` or `active: false` on each task progress object. The
property is optional for backward compatibility: its absence on legacy nonterminal data means
the acceptance state is unknown, not false. Terminal tasks are inactive even when legacy data
omits `active`; new completed, failed and uncompleted writes explicitly set it to `false`.
Clients must not infer active from `complete: false` and `failed: false`. Existing clients can
continue using `complete` and `failed` and ignore `active`.

---

## Rate Limits (API Gateway)

This section covers **external progress API quotas only** (Worker + Durable Object). App mutation
limits, shared profile limits, Auth limits, and DB hard caps live in a separate ownership map:
[`rate-limiting.md`](./rate-limiting.md).

Progress API requests (`api.tarkovtracker.org`) are subject to tiered daily quotas keyed by user account (not per token). Daily quotas reset at 00:00 UTC and count authenticated requests admitted for processing.

In **Settings → API**, open **Account activity & quota** to see the latest recorded limiter decision
for reads and writes across the account. **Today** covers the current UTC quota window and
**Last 24 hours** is a rolling activity view. Each token also has its own activity view. Filter by
endpoint, client, or daily quota throttles and copy the displayed request evidence to report
unexpected polling. A client name is self-reported. The account owner can see up to 30 days of
history from the start of collection, including revoked tokens' requests in account activity.
Only requests that reach the quota check can appear. Each quota snapshot comes from a recorded
limiter decision and can be absent or stale if collection misses an event.

The hourly `api-request-activity-cleanup` job permanently expires this telemetry after 30 days.
To pause cleanup during an incident, disable that named job through an approved forward migration
and restore the hourly schedule after recovery. Use authorized database point-in-time recovery into
an isolated instance if investigation requires a deleted row and the backup window covers it.

| Tier      | Reads/day | Writes/day |
| --------- | --------- | ---------- |
| Free      | 1,000     | 100        |
| Supporter | 2,000     | 250        |
| Scav      | 2,000     | 250        |
| Timmy     | 3,000     | 400        |
| Chad      | 5,000     | 600        |

The gateway resolves the tier from `public.supporters` for the token owner and caches successful
lookups for up to 60 seconds. Active subscriptions and past-due subscriptions within their recorded
grace period keep paid limits; expired subscriptions return to Free limits.

A pre-authentication IP-based abuse gate (Cloudflare Workers Rate Limiting binding) shields
the token validation step from floods. It is deliberately coarse — infrastructure protection,
not a customer quota — and is not advertised as a per-IP entitlement.

Authentication and the daily-quota check run before request-input validation, so a malformed request
from an unauthenticated or over-quota client returns `401`/`429` rather than `400`. Once a request is
authorized, validation `400` responses (malformed URL params, invalid JSON body) carry the same
`X-RateLimit-*` headers as successful responses — and, like them, omit those headers on the fail-open
path when no quota decision is available.

Responses for which the daily-quota service returns a quota decision include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix seconds). When that decision denies the request, the gateway responds with `429` and `Retry-After`. Pre-authentication abuse-gate `429` responses include only `Retry-After`, and fail-open responses (daily-quota service temporarily unavailable) omit the `X-RateLimit-*` headers. When a free-tier user exhausts a daily quota, the `429` body includes an upgrade link. Admins can inspect the top consumers via `GET /api/admin/api-usage`; usage is bucketed by UTC day, so the report covers the current and previous UTC day (the `since` field gives the exact starting day).

### Conditional Requests & Polling

`GET /progress` and `GET /team/progress` return a weak `ETag` derived from the response payload and use `Cache-Control: private, max-age=15`. Response bodies of **1 KiB or larger** are gzipped when the request includes `Accept-Encoding: gzip`; smaller payloads are sent uncompressed, so do not assume `Content-Encoding` is always present. An explicit `Accept-Encoding: gzip;q=0` is honored as a refusal. If a client accepts gzip but explicitly refuses identity (`identity;q=0`), even sub-1 KiB payloads are gzipped since uncompressed is not acceptable to that client; if no acceptable encoding remains the gateway returns `406 no_acceptable_encoding`. Send the previous response's `ETag` in `If-None-Match`; when nothing changed the gateway answers `304 Not Modified` with an empty body. Rate-limit headers (`X-RateLimit-*`) are included on `200` and `304` responses only when a daily-quota decision is available — on the fail-open path (daily-quota service temporarily unavailable) those headers are omitted but the `ETag`/`304` mechanism still applies. A `304` still counts against the daily quota, so it saves bandwidth, not quota.

Polling integrators (TarkovMonitor, tarkov.dev, RatScanner) should poll read endpoints at **≥60-second intervals** and always send `If-None-Match`. Idle accounts then cost a few hundred bytes per poll instead of a full progress payload.

### Active Token Cap

Each account may have at most **3 active API tokens**. This is enforced by a database trigger, so token rotation cannot bypass it. The `token-create` Edge Function returns `409` with `error: "Token limit reached (3 active)"` when the cap is reached. Revoke an existing token before creating a new one. Token creation is only allowed through the `token-create` Edge Function (authenticated clients cannot insert into `api_tokens` directly) and is rate-limited to 3 creates per hour per account. The `permissions` field must be a non-empty array of `GP`/`TP`/`WP`; any other shape or value is rejected with `400` before insertion.

Token names can be changed from Settings → API Tokens without rotating the token. Renaming updates
only the token's optional `note`: authenticated users receive column-level `UPDATE (note)` permission,
and row-level security requires the token owner for both the existing and resulting row.

### Token Prefixes

Progress API tokens are prefixed `PVP_`, `PVE_`, or `SZN_`. The prefix declares the token's mode,
and the token's stored `game_mode` decides which exact normalized `(user_id, game_mode, season_number)`
progress row every read and write touches, never the mode the owner is currently viewing on the
site. Persistent PvP/PvE use season `0`; Seasonal tokens use the active season. The token prefix and
stored mode are kept from diverging at three layers:

- `token-create` rejects a `gameMode` outside `pvp`/`pve`/`seasonal` with `400`, and rejects a supplied
  `tokenValue` whose prefix contradicts `gameMode` with `400 tokenValue prefix must match gameMode`.
- A `NOT VALID` check constraint on `api_tokens` requires `token_value` to carry the prefix matching
  `game_mode`.
- The gateway rejects a token whose prefix disagrees with its stored `game_mode` with
  `401 Token game mode mismatch` instead of silently serving the stored mode.

Legacy `tt_` tokens are no longer accepted; they fail with `401 Invalid token format`. Create a
`PVP_`/`PVE_`/`SZN_` token in Settings → API Tokens instead.

---

## Error Responses

Nuxt/Pages `/api/*` routes return errors in this format:

```json
{
  "error": "Error message",
  "statusCode": 500,
  "statusMessage": "Internal Server Error"
}
```

Admin routes also include a stable machine-readable code in `data.code`. The English serialized
`statusMessage` fallback remains for API clients that do not localize responses; the admin UI maps these codes to
locale keys instead of rendering server text. Current admin codes are `admin_privileges_required`,
`authentication_required`, `cache_purge_failed`, `invalid_channel`, `invalid_display_name`,
`invalid_enabled_flag`, `invalid_purge_type`, `invalid_request_body`,
`invalid_target_user_id`, `invalid_tier`, `method_not_allowed`, `service_config_missing`,
`supabase_request_failed`,
`supporter_update_failed`, and `twitch_config_update_failed`; the set lives in
`app/utils/adminErrors.ts` (`AdminErrorCode`).

The public API gateway (`api.tarkovtracker.org`) uses its own envelope,
`{"success": false, "error": "..."}`. Unexpected gateway failures always return `500` with the fixed
body `{"success": false, "error": "Internal server error"}`; the underlying exception is logged
server-side only, so clients must not parse `500` bodies for diagnostic detail. Client-correctable
problems keep their specific `4xx` messages in the same envelope.

---

## Caching Behavior

### Client-Side (IndexedDB)

IndexedDB schema 9 stores neutral catalogs in mode scopes and strings in language
scopes. `generateCacheKey` produces keys such as the following.

- `tarkov-tasks-core-neutral-v2-regular-en`
- `tarkov-hideout-neutral-v1-pve-en`
- `tarkov-items-lite-neutral-v1-pvp-season-en`
- `tarkov-strings-strings-v1-de`

The neutral entries share the `en` storage partition across display languages.
Localized views are produced from the cached neutral value and selected table.
Bootstrap retains its existing mode-scoped numeric cache.

### Server-Side Snapshots

Catalog and strings routes use `Cache-Control: no-store`. Their objects are
prepared off the request path, gzip-stored under immutable keys, and selected by
the complete release manifest. A per-colo compressed Cache API copy is reused
when its key and timestamp match the active manifest. A KV-failure fallback is
marked `STALE`. Operational `cache-meta` retains its separately documented edge
cache behavior.

### Publishing and Purging

Publish a complete precompute release to change catalog contents. Then use the
admin Tarkov data purge to invalidate browser metadata and string tables. The
purge retains historical edge-cache retirement targets. A browser refresh reads
the active snapshot release. Request query parameters do not generate a new release.

---

## Supported Languages

`/api/tarkov/strings?lang=` accepts `CATALOG_LANGUAGES`, derived from
`SUPPORTED_LOCALES` and `LOCALE_TO_API_MAPPING`. Unsupported codes use `en`. The
neutral datasets are scoped only by mode. Their upstream base envelopes retain
translation keys, while the producer resolves dictionaries into one merged,
referenced-key bundle per selectable API language. Upstream mode and endpoint
scope are preserved for keys whose values differ. See
[the fetching pipeline](systems/game-data.md#upstream-fetching-and-translation).

| Code | Language   |
| ---- | ---------- |
| `cs` | Czech      |
| `de` | German     |
| `en` | English    |
| `es` | Spanish    |
| `fr` | French     |
| `it` | Italian    |
| `ja` | Japanese   |
| `ko` | Korean     |
| `pl` | Polish     |
| `pt` | Portuguese |
| `ru` | Russian    |
| `tr` | Turkish    |
| `zh` | Chinese    |

The enabled UI locales are `cs`, `de`, `en`, `es`, `fr`, `it`, `ja`, `ko`, `pl`,
`pt`, `ru`, `tr`, `uk`, and `zh`. Ukrainian uses the English game-data bundle through
`LOCALE_TO_API_MAPPING`, while its interface remains Ukrainian. Expanding the UI
language list updates the producer's required language scopes and requires a full
precompute release before consumer promotion.

---

## Game Modes

| Mode         | Description                          |
| ------------ | ------------------------------------ |
| `regular`    | Persistent standard PvP mode         |
| `pve`        | Persistent PvE (Co-op) mode          |
| `pvp-season` | Numbered Seasonal PvP game-data mode |

The application keeps the stable internal mode name `seasonal` and maps it to the upstream
`pvp-season` endpoint. The active season number is stored separately from the mode so future
seasons create new progress rows without overwriting earlier Seasonal history.

---

## Data Overlay

All task data is enhanced with community corrections from the `tarkov-data-overlay` dataset.
