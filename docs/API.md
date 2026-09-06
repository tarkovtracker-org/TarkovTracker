# TarkovTracker API Documentation

<!-- AGENT QUICK REFERENCE
Progress API host: api.tarkovtracker.org (Bearer api_token auth).
Internal routes: /api/tarkov/* (cached game-data proxy, NOT a public integration surface).
Team routes: /api/team/* (Supabase JWT auth).
Profile routes: /api/profile/* (public, rate-limited — no auth for shared profiles).
Game modes in API: regular (pvp), pve, pvp-season (seasonal).
Rate limits: §Rate Limits. OpenAPI spec: workers/api-gateway/src/openapi.ts.
-->

## Overview

TarkovTracker provides internal API routes for fetching game data and team information. Game data is proxied through Nuxt server routes to `json.tarkov.dev` with caching and overlay corrections applied.
Set `NUXT_TARKOV_JSON_BASE_URL` to point static game-data requests at a compatible `json.tarkov.dev` mirror.

> **Upstream data source.** TarkovTracker consumes the static JSON endpoints at `json.tarkov.dev`.
> The endpoint catalog lives at `https://json.tarkov.dev/endpoints`. The older `api.tarkov.dev`
> GraphQL playground is deprecated and unstable; do not use it for game data or external tooling.

## Base URL

- **Development:** `http://localhost:3000/api`
- **Production:** `https://tarkovtracker.org/api`

## Progress API Host Migration (api.tarkovtracker.org)

The progress API gateway (token, progress, team progress) is served on `https://api.tarkovtracker.org` (clean paths, `/api/v2/*` also accepted). The legacy `https://tarkovtracker.org/api/v2/*` routes remain served during the deprecation window.

Migration plan:

1. TarkovMonitor >= the release containing tarkovtracker-org/TarkovMonitor#3 calls `api.tarkovtracker.org` directly.
2. Once that release has propagated, ops flip the gateway var `LEGACY_API_REDIRECT` to `"true"` (see `workers/api-gateway/wrangler.toml`); legacy `/api` and `/api/v2` requests then receive a `308` redirect to the subdomain with `Deprecation` and `Link: rel="successor-version"` headers.
3. Clients should migrate proactively rather than relying on the redirect: .NET `HttpClient` (and several other HTTP stacks) drop the `Authorization` header on cross-host redirects, so authenticated calls through the redirect will fail with `401`.

Migration example:

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

> **First-party routes, not a third-party API.** `/api/tarkov/*` exists to serve game data to the
> TarkovTracker site itself. It is not a supported integration surface, carries no compatibility
> guarantee, and its response shape can change in any release. Third-party clients should read game
> data from `json.tarkov.dev` directly, or use the progress API at `https://api.tarkovtracker.org`
> (see [Progress API Host Migration](#progress-api-host-migration-apitarkovtrackerorg)).
>
> These routes are public and pass through the API protection middleware; see
> [`ARCHITECTURE.md#api-protection`](./ARCHITECTURE.md#api-protection) for access-control configuration and
> [`RATE_LIMITING.md`](./RATE_LIMITING.md) for rate-limit ownership.

### GET /api/tarkov/bootstrap

Fetches minimal player level data for early UI rendering.

**Query Parameters:**

| Parameter | Type   | Default | Description                                     |
| --------- | ------ | ------- | ----------------------------------------------- |
| `lang`    | string | `en`    | Language code (see Supported Languages section) |

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

**Cache TTL:** 12 hours

---

### GET /api/tarkov/tasks-core

Fetches core task data (tasks, maps, traders) without objectives or rewards.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `lang`     | string | `en`      | Language code                                 |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Response:**

```json
{
  "data": {
    "tasks": [
      {
        "id": "5936d90786f7742b1420ba5b",
        "name": "Debut",
        "trader": { "id": "...", "name": "Prapor" },
        "map": { "id": "...", "name": "Customs" },
        "experience": 1500,
        "minPlayerLevel": 1
      }
    ],
    "maps": [...],
    "traders": [...]
  }
}
```

**Cache TTL:** 12 hours

---

### GET /api/tarkov/tasks-objectives

Fetches task objectives and fail conditions.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `lang`     | string | `en`      | Language code                                 |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Cache TTL:** 12 hours

---

### GET /api/tarkov/tasks-rewards

Fetches task rewards (start, finish, failure).

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `lang`     | string | `en`      | Language code                                 |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Cache TTL:** 12 hours

---

### GET /api/tarkov/hideout

Fetches hideout stations with levels, requirements, and crafts.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `lang`     | string | `en`      | Language code                                 |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Cache TTL:** 12 hours

---

### GET /api/tarkov/items-lite

Fetches lightweight item data (id, name, shortName, image).

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `lang`     | string | `en`      | Language code                                 |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Cache TTL:** 24 hours

---

### GET /api/tarkov/items

Fetches full item data including properties.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `lang`     | string | `en`      | Language code                                 |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Cache TTL:** 24 hours

---

### GET /api/tarkov/prestige

Fetches prestige level requirements.

**Query Parameters:**

| Parameter | Type   | Default | Description   |
| --------- | ------ | ------- | ------------- |
| `lang`    | string | `en`    | Language code |

Prestige is intentionally sourced from `regular/tasks` and cached by language only because
`json.tarkov.dev` currently has no PvE prestige data.

**Cache TTL:** 24 hours

---

### GET /api/tarkov/map-spawns

Fetches map spawn point data.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                                   |
| ---------- | ------ | --------- | --------------------------------------------- |
| `lang`     | string | `en`      | Language code                                 |
| `gameMode` | string | `regular` | Game mode (`regular`, `pve`, or `pvp-season`) |

**Cache TTL:** 12 hours

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

**Cache TTL:** Never cached (`Cache-Control: no-store`)

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

| Function       | Purpose                                |
| -------------- | -------------------------------------- |
| `team-create`  | Create a team and its owner membership |
| `team-join`    | Join a team with an invite code        |
| `team-leave`   | Leave a team as a non-owner            |
| `team-kick`    | Remove a member as the owner           |
| `team-disband` | Atomically remove an owned team        |

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

| Field      | Type   | Required     | Description                      |
| ---------- | ------ | ------------ | -------------------------------- |
| `mode`     | string | Yes          | `subscription` or `payment`      |
| `tier`     | string | Subscription | `scav`, `timmy`, or `chad`       |
| `interval` | string | Subscription | `monthly`, `6month`, or `yearly` |
| `amount`   | number | One-time     | USD amount (min 1, max 999)      |

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
| 503    | Unable to verify existing subscription                  | Supabase billing-state lookup is unavailable |

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

## Rate Limits (API Gateway)

This section covers **external progress API quotas only** (Worker + Durable Object). App mutation
limits, shared profile limits, Auth limits, and DB hard caps live in a separate ownership map:
[`RATE_LIMITING.md`](./RATE_LIMITING.md).

Progress API requests (`api.tarkovtracker.org`, `/api/v2/*`) are subject to tiered daily quotas keyed by user account (not per token). Daily quotas reset at 00:00 UTC and count authenticated requests admitted for processing.

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
`authentication_required`, `invalid_channel`, `invalid_display_name`, `invalid_enabled_flag`, `invalid_request_body`,
`invalid_target_user_id`, `invalid_tier`, `service_config_missing`, `supabase_request_failed`,
`supporter_update_failed`, and `twitch_config_update_failed`.

The public API gateway (`api.tarkovtracker.org`) uses its own envelope,
`{"success": false, "error": "..."}`. Unexpected gateway failures always return `500` with the fixed
body `{"success": false, "error": "Internal server error"}`; the underlying exception is logged
server-side only, so clients must not parse `500` bodies for diagnostic detail. Client-correctable
problems keep their specific `4xx` messages in the same envelope.

---

## Caching Behavior

### Client-Side (IndexedDB)

The client caches API responses in IndexedDB with keys like:

- `tarkov-tasks-core-regular-en`
- `tarkov-hideout-pve-de`
- `tarkov-tasks-core-pvp-season-en`
- `tarkov-items-lite-regular-en`
- `tarkov-prestige-all-regular-en`

### Server-Side (Edge)

Cloudflare edge caching with `Cache-Control` headers:

```http
Cache-Control: public, max-age=43200
```

Note: 43200 seconds = 12 hours (default), 86400 seconds = 24 hours (extended)

### Cache Busting

Pass `cacheBust=1` query parameter to bypass cache.

---

## Supported Languages

The `lang` query parameter is validated against `API_SUPPORTED_LANGUAGES` (`app/utils/constants.ts`); codes outside that allowlist fall back to `en` (`getValidatedLanguage` in `app/server/utils/language-helpers.ts`).

`lang` is not forwarded to upstream as a query parameter. `json.tarkov.dev` serves an English base document containing translation keys plus a separate per-language document at `{gameMode}/{endpoint}_{lang}`; the proxy fetches both (plus `_en` as a per-key fallback) and merges them via the base document's `translations` JSONPath list. See [Data fetching pipeline](SYSTEMS.md#2-data-fetching-pipeline).

**Language codes accepted by `/api/tarkov/*`:**

| Code | Language   |
| ---- | ---------- |
| `cs` | Czech      |
| `de` | German     |
| `en` | English    |
| `es` | Spanish    |
| `fr` | French     |
| `hu` | Hungarian  |
| `it` | Italian    |
| `ja` | Japanese   |
| `ko` | Korean     |
| `pl` | Polish     |
| `pt` | Portuguese |
| `ro` | Romanian   |
| `ru` | Russian    |
| `sk` | Slovak     |
| `tr` | Turkish    |
| `zh` | Chinese    |

This allowlist is a subset of what upstream serves. `json.tarkov.dev` additionally supports `id`, `th`, and `vn`; add them to `API_SUPPORTED_LANGUAGES` when the API should accept those languages on `/api/tarkov/*` requests. Enabling a UI locale is a separate step (`SUPPORTED_LOCALES` below). The authoritative upstream list is the `languages` array at `https://json.tarkov.dev/endpoints`.

**Enabled UI locales** (`SUPPORTED_LOCALES` in `app/utils/locales.ts`):

`cs` (Czech), `de` (German), `en` (English), `es` (Spanish), `fr` (French), `it` (Italian), `ko` (Korean), `pl` (Polish), `pt` (Portuguese), `ru` (Russian), `uk` (Ukrainian), `zh` (Chinese)

**UI locale with upstream fallback.** `uk` (Ukrainian) is an enabled UI locale but is **not supported by `json.tarkov.dev`**. It is mapped to `en` via `LOCALE_TO_API_MAPPING` in `app/utils/constants.ts`, so Ukrainian users see English game data while the rest of the UI remains in Ukrainian.

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

All task data is enhanced with community corrections from the [tarkov-data-overlay](https://github.com/tarkovtracker-org/tarkov-data-overlay) repository.
