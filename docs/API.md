# TarkovTracker API Documentation

## Overview

TarkovTracker provides internal API routes for fetching game data and team information. Game data is proxied through Nuxt server routes to `json.tarkov.dev` with caching and overlay corrections applied.
Set `NUXT_TARKOV_JSON_BASE_URL` to point static game-data requests at a compatible `json.tarkov.dev` mirror.

## Base URL

- **Development:** `http://localhost:3000/api`
- **Production:** `https://tarkovtracker.org/api`

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

Creates a Stripe Checkout session for supporter subscriptions or one-time payments. Requires authentication.

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

| Status | Message                           | Cause                      |
| ------ | --------------------------------- | -------------------------- |
| 400    | Invalid tier / Invalid interval   | Bad request body           |
| 401    | Authentication required           | Missing or invalid session |
| 500    | Stripe not configured             | Server missing Stripe keys |
| 502    | Failed to create checkout session | Stripe API error           |

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

- `tasks-core-json-v1-regular-en`
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
