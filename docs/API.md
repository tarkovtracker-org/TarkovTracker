# TarkovTracker API Documentation

## Overview

TarkovTracker provides internal API routes for fetching game data and team information. Game data is proxied through Nuxt server routes to `json.tarkov.dev` with caching and overlay corrections applied.
Set `NUXT_TARKOV_JSON_BASE_URL` to point static game-data requests at a compatible `json.tarkov.dev` mirror.

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

Most tarkov data endpoints are public. Team endpoints require Supabase authentication.

```http
Authorization: Bearer <supabase_jwt_token>
```

## Tarkov Data Endpoints

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

| Parameter  | Type   | Default   | Description                    |
| ---------- | ------ | --------- | ------------------------------ |
| `lang`     | string | `en`      | Language code                  |
| `gameMode` | string | `regular` | Game mode (`regular` or `pve`) |

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

| Parameter  | Type   | Default   | Description   |
| ---------- | ------ | --------- | ------------- |
| `lang`     | string | `en`      | Language code |
| `gameMode` | string | `regular` | Game mode     |

**Cache TTL:** 12 hours

---

### GET /api/tarkov/tasks-rewards

Fetches task rewards (start, finish, failure).

**Query Parameters:**

| Parameter  | Type   | Default   | Description   |
| ---------- | ------ | --------- | ------------- |
| `lang`     | string | `en`      | Language code |
| `gameMode` | string | `regular` | Game mode     |

**Cache TTL:** 12 hours

---

### GET /api/tarkov/hideout

Fetches hideout stations with levels, requirements, and crafts.

**Query Parameters:**

| Parameter  | Type   | Default   | Description   |
| ---------- | ------ | --------- | ------------- |
| `lang`     | string | `en`      | Language code |
| `gameMode` | string | `regular` | Game mode     |

**Cache TTL:** 12 hours

---

### GET /api/tarkov/items-lite

Fetches lightweight item data (id, name, shortName, image).

**Query Parameters:**

| Parameter  | Type   | Default   | Description                    |
| ---------- | ------ | --------- | ------------------------------ |
| `lang`     | string | `en`      | Language code                  |
| `gameMode` | string | `regular` | Game mode (`regular` or `pve`) |

**Cache TTL:** 24 hours

---

### GET /api/tarkov/items

Fetches full item data including properties.

**Query Parameters:**

| Parameter  | Type   | Default   | Description                    |
| ---------- | ------ | --------- | ------------------------------ |
| `lang`     | string | `en`      | Language code                  |
| `gameMode` | string | `regular` | Game mode (`regular` or `pve`) |

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

| Parameter  | Type   | Default   | Description                    |
| ---------- | ------ | --------- | ------------------------------ |
| `lang`     | string | `en`      | Language code                  |
| `gameMode` | string | `regular` | Game mode (`regular` or `pve`) |

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
      "tasksCompleted": 120
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

Progress API requests (`api.tarkovtracker.org`, `/api/v2/*`) are subject to tiered quotas keyed by user account (not per token). Daily quotas reset at 00:00 UTC; burst limits use a 60-second sliding window so batch updates near a minute boundary are not spuriously throttled.

| Tier      | Reads/day | Writes/day | Burst/min |
| --------- | --------- | ---------- | --------- |
| Free      | 1,000     | 100        | 30        |
| Supporter | 2,000     | 250        | 60        |
| Scav      | 2,000     | 250        | 60        |
| Timmy     | 3,000     | 400        | 90        |
| Chad      | 5,000     | 600        | 120       |

The gateway resolves the tier from `public.supporters` for the token owner and caches successful
lookups for up to 60 seconds. Active subscriptions and past-due subscriptions within their recorded
grace period keep paid limits; expired subscriptions return to Free limits.

A per-IP backstop applies on top of the per-user quotas: 600 reads/hour and 200 writes/hour per IP address (1-hour sliding window). This catches abuse from many accounts sharing one IP while remaining generous enough for shared NAT users. IP-throttled requests do not consume the daily or burst quotas.

Every gateway response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` (Unix seconds) for the daily quota, plus `Retry-After` on `429` responses. On burst or IP `429`s the `X-RateLimit-*` headers still describe the daily quota (throttled requests do not consume it) while `Retry-After` indicates when capacity frees. When a free-tier user exhausts a daily quota, the `429` body includes an upgrade link. Admins can inspect the top consumers via `GET /api/admin/api-usage`; usage is bucketed by UTC day, so the report covers the current and previous UTC day (the `since` field gives the exact starting day).

### Active Token Cap

Each account may have at most **3 active API tokens**. This is enforced by a database trigger, so token rotation cannot bypass it. The `token-create` Edge Function returns `409` with `error: "Token limit reached (3 active)"` when the cap is reached. Revoke an existing token before creating a new one. Token creation is only allowed through the `token-create` Edge Function (authenticated clients cannot insert into `api_tokens` directly) and is rate-limited to 3 creates per hour per account.

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "statusCode": 500,
  "statusMessage": "Internal Server Error"
}
```

---

## Caching Behavior

### Client-Side (IndexedDB)

The client caches API responses in IndexedDB with keys like:

- `tasks-core-json-v2-regular-en`
- `hideout-json-v1-pve-de`
- `items-lite-json-v1-regular-en`
- `prestige-all-json-v1-en`

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

**Enabled UI locales** (from `SUPPORTED_LOCALES` in `app/utils/locales.ts`):

| Code | Language  |
| ---- | --------- |
| `en` | English   |
| `de` | German    |
| `es` | Spanish   |
| `fr` | French    |
| `ru` | Russian   |
| `uk` | Ukrainian |
| `zh` | Chinese   |

**Locale JSON files that exist but are not currently enabled** (may be enabled in the future; Crowdin may still sync translations for these):

`cs` (Czech), `it` (Italian), `ko` (Korean), `pl` (Polish), `pt` (Portuguese)

The API accepts any language code that `json.tarkov.dev` supports; unsupported codes fall back to English.

---

## Game Modes

| Mode      | Description       |
| --------- | ----------------- |
| `regular` | Standard PvP mode |
| `pve`     | PvE (Co-op) mode  |

---

## Data Overlay

All task data is enhanced with community corrections from the [tarkov-data-overlay](https://github.com/tarkovtracker-org/tarkov-data-overlay) repository.
