# TarkovTracker API Documentation

## Overview

TarkovTracker provides internal API routes for fetching game data and team information. All game data is proxied through Nuxt server routes to the tarkov.dev GraphQL API with caching and overlay corrections applied.

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

| Parameter | Type   | Default | Description   |
| --------- | ------ | ------- | ------------- |
| `lang`    | string | `en`    | Language code |

**Cache TTL:** 24 hours

---

### GET /api/tarkov/items

Fetches full item data including properties.

**Query Parameters:**

| Parameter | Type   | Default | Description   |
| --------- | ------ | ------- | ------------- |
| `lang`    | string | `en`    | Language code |

**Cache TTL:** 24 hours

---

### GET /api/tarkov/prestige

Fetches prestige level requirements.

**Query Parameters:**

| Parameter | Type   | Default | Description   |
| --------- | ------ | ------- | ------------- |
| `lang`    | string | `en`    | Language code |

**Cache TTL:** 24 hours

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

- `tasks-core-en-regular`
- `hideout-de-pve`
- `items-lite-en`

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

> **Note:** Ukrainian (`uk`) is supported in the UI but maps to English for API requests.

---

## Game Modes

| Mode      | Description       |
| --------- | ----------------- |
| `regular` | Standard PvP mode |
| `pve`     | PvE (Co-op) mode  |

---

## Data Overlay

All task data is enhanced with community corrections from the [tarkov-data-overlay](https://github.com/tarkovtracker-org/tarkov-data-overlay) repository.
