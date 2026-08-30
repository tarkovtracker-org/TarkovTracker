# Rate Limiting & Abuse Controls

<!-- AGENT QUICK REFERENCE
Design: ONE primary enforcer per traffic class at the closest trusted edge.
Check §Traffic classes and owners before adding a new limiter — someone may already own it.
Layers: Cloudflare WAF → Pages Function → Worker DO → Edge Function RPC → Postgres.
API gateway: Durable Object token-bucket (workers/api-gateway).
App routes: Nitro middleware + Supabase RPC per-user limits.
-->

This document is the **ownership map** for every rate-limit / abuse system in TarkovTracker.

If you are about to add a new limiter, read this first. Most confusion in this repo comes from
assuming “we already rate-limit everything in one place.” We do **not**. Different traffic classes
have different enforcers on purpose.

Related docs:

- External progress API quotas: [`API.md`](./API.md#rate-limits-api-gateway)
- System architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Incident knobs: [`runbook.md`](./runbook.md)

---

## Design principle

> **One primary enforcer per traffic class, at the closest trusted edge.**  
> Frontend cooldowns are UX only. Database rules are hard invariants. Platform auth limits stay
> with Supabase Auth.

| Layer                             | May enforce?                          | Notes                                         |
| --------------------------------- | ------------------------------------- | --------------------------------------------- |
| Browser UI                        | UX only                               | Disable double-submit / toast; never security |
| Cloudflare Pages / Nitro `/api/*` | Yes (app reads / internal endpoints)  | Prefer Durable Object binding when available  |
| Cloudflare Worker (`api-gateway`) | Yes (external token API)              | Primary high-QPS enforcer                     |
| Supabase Edge Functions           | Yes (authenticated mutations)         | Critical low-frequency writes                 |
| Postgres                          | Hard caps / durable mutation counters | Not for high-QPS API traffic                  |
| Supabase Auth platform            | Yes (login / refresh / signup)        | Do not reimplement                            |

---

## Traffic classes and owners

```mermaid
flowchart TB
  subgraph clients [Clients]
    UI[Browser SPA]
    EXT[External API clients<br/>TarkovMonitor / scripts]
    AUTH[Sign-in / refresh flows]
  end

  subgraph appEdge [App edge]
    PAGES[Cloudflare Pages / Nitro<br/>app/server/api/*]
    EDGE[Supabase Edge Functions]
  end

  subgraph apiEdge [External API edge]
    WG[workers/api-gateway]
    DO[ApiGatewayRateLimiter DO]
  end

  subgraph data [Data / platform]
    PG[(Postgres)]
    MRL[(public.mutation_rate_limits)]
    ADA[(account_deletion_attempts)]
    CAP[DB triggers / RLS / unique constraints]
    SA[Supabase Auth rate limits]
  end

  UI -->|shared profile / team members / client logs| PAGES
  UI -->|team / token / account mutations| EDGE
  UI -->|login / refresh| SA
  EXT -->|Bearer token /api/v2/*| WG
  WG --> DO
  WG --> PG
  EDGE -->|consume_mutation_rate_limit| MRL
  EDGE -->|account-delete attempts| ADA
  EDGE --> CAP
  PAGES -->|optional API_GATEWAY_LIMITER binding| DO
  PAGES --> PG
```

### Ownership matrix

| Traffic class               | Examples                                                 | Primary enforcer                        | Secondary / hard stop                    | Storage / implementation                   |
| --------------------------- | -------------------------------------------------------- | --------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| External progress API       | `/api/v2/*` on `api.tarkovtracker.org`                   | Worker DO daily quota + IP abuse gate   | Supporter tier resolution, token auth    | `ApiGatewayRateLimiter`, `api_usage_daily` |
| Authenticated app mutations | team create/join/leave/kick/disband, token create/revoke | Edge Function mutation limiter          | DB token cap (3 active), RLS             | `mutation_rate_limits` + RPC               |
| Public / shared app reads   | shared profile, team members, tarkov-dev profile         | Pages/Nitro shared limiter              | CDN/cache TTLs, Cloudflare WAF if needed | `sharedEdgeStore` (+ DO if bound)          |
| Destructive account ops     | account delete                                           | Edge Function (dedicated table for now) | Deletion jobs queue                      | `account_deletion_attempts`                |
| Auth platform               | signup, sign-in, refresh, OTP                            | Supabase Auth                           | Captcha (optional)                       | GoTrue `[auth.rate_limit]`                 |
| Outbound third parties      | Discord API, Stripe                                      | Provider `Retry-After` / SDK rules      | Circuit breakers, job retries            | not user quotas                            |

---

## End-to-end flows

### A. Authenticated app mutations (`mutation_rate_limits`)

Still fully integrated and live.

```mermaid
sequenceDiagram
  participant UI as Browser UI
  participant EF as useEdgeFunctions
  participant FN as Edge Function
  participant RPC as consume_mutation_rate_limit
  participant T as mutation_rate_limits

  UI->>EF: createTeam / joinTeam / createToken / ...
  EF->>FN: functions.invoke(name, body) with user JWT
  FN->>FN: authenticateUser(req)
  FN->>RPC: enforceUserMutationRateLimit(userId, action)
  RPC->>T: upsert scope+subject window
  alt over limit
    RPC-->>FN: allowed=false, reset_at
    FN-->>UI: 429 + Retry-After
  else allowed
    RPC-->>FN: allowed=true
    FN->>FN: perform mutation (insert/update)
    FN-->>UI: 200 success payload
  end
```

**Frontend entrypoints**

- Teams: `app/features/team/*` via `app/composables/api/useEdgeFunctions.ts`
- Tokens: `app/features/settings/ApiTokens.vue` via the same composable

**Edge Functions (enforced today)**

| Function       | Scope key      | Limit | Window |
| -------------- | -------------- | ----: | ------ |
| `team-create`  | `team-create`  |    10 | 1 hour |
| `team-join`    | `team-join`    |    30 | 10 min |
| `team-leave`   | `team-leave`   |    30 | 1 hour |
| `team-kick`    | `team-kick`    |    20 | 1 hour |
| `team-disband` | `team-disband` |    10 | 1 hour |
| `token-create` | `token-create` |     3 | 1 hour |
| `token-revoke` | `token-revoke` |    50 | 10 min |

Source of truth for limits: `supabase/functions/_shared/rate-limit.ts`  
RPC + table: migration `supabase/migrations/20260404120000_add_mutation_rate_limit_rpc.sql`

**How the counter works**

1. Key = `(scope, subject)` where `subject` is the authenticated user id.
2. Fixed window of `window_seconds`.
3. If no row or `now >= reset_at`, start a new window at count `1`.
4. Else if `count >= limit`, deny.
5. Else increment and allow.
6. Uses a transaction advisory lock so concurrent requests for the same subject cannot stampede.

**Security posture**

- RLS enabled; deny-all policy for clients
- `anon` / `authenticated` have no table grants
- only `service_role` / SECURITY DEFINER RPC can mutate counters

**Known bypass gaps**

- **Token create** is Edge-only by default. A direct insert into `api_tokens` is used only when
  `NUXT_PUBLIC_ALLOW_DIRECT_TOKEN_CREATE_FALLBACK=true` (default **false** in `nuxt.config.ts` /
  `ApiTokens.vue`). Keep that flag off in production so create stays on the Edge limiter.
- **Token revoke** has an automatic unavailable-function fallback to direct delete in
  `useEdgeFunctions.revokeToken`. That path **skips** the Edge limiter; DB/RLS still apply.
- **Token rename** is a direct PostgREST update and is not Edge-rate-limited. Database grants restrict
  authenticated updates to the `note` column, and RLS restricts the row to its owner.
- The DB still enforces the **max 3 active tokens** trigger even if rate limiting is skipped.
- Prefer keeping create/revoke behind Edge Functions in production and avoid enabling create
  fallbacks.

**Hygiene**

Expired rows are harmless but accumulate. The `mutation-rate-limits-cleanup` pg_cron job
(`supabase/migrations/20260807130000_add_usage_and_rate_limit_retention.sql`) runs this nightly at
03:30 UTC; run it manually only when investigating an incident:

```sql
DELETE FROM public.mutation_rate_limits
WHERE reset_at < now() - interval '1 day';
```

---

### B. External API gateway (Worker + Durable Object)

This is the high-volume system used by token-authenticated progress clients. It does **not** use
`mutation_rate_limits`.

```mermaid
flowchart LR
  C[External client + API token] --> W[api-gateway Worker]
  W --> ABUSE[IP abuse gate<br/>Cloudflare Rate Limiting binding]
  ABUSE --> AUTH[Validate token hash]
  AUTH --> TIER[Resolve supporter tier]
  TIER --> DAILY[DO daily quota<br/>utc-day window]
  DAILY --> HANDLER[Progress / team handlers]
  HANDLER --> DB[(Supabase)]
  W --> USAGE[record_api_usage RPC<br/>api_usage_daily]
```

**Daily limits** (from `workers/api-gateway/src/limits.ts`):

| Tier      | Reads/day | Writes/day |
| --------- | --------: | ---------: |
| Free      |     1,000 |        100 |
| Supporter |     2,000 |        250 |
| Scav      |     2,000 |        250 |
| Timmy     |     3,000 |        400 |
| Chad      |     5,000 |        600 |

**Abuse gate**: a pre-authentication IP-keyed Cloudflare Workers Rate Limiting binding that
shields the `api_tokens` lookup from floods. Coarse by design (infrastructure protection, not a
customer quota). Counter is per-Cloudflare-location and eventually consistent.

Details and response headers: [`API.md`](./API.md#rate-limits-api-gateway)

Implementation notes:

- Enforcer class: `ApiGatewayRateLimiter` in `workers/api-gateway/src/rateLimiter.ts`
- Gateway routing, authentication, and HTTP responses are isolated in `router.ts`,
  `authentication.ts`, and `responses.ts`; `index.ts` remains the Worker entrypoint
- Keys are namespaced (`daily-read:<userId>`, `daily-write:<userId>`)
- Daily quota uses a UTC-day fixed window; a quota unit is consumed when a valid authenticated
  request is admitted for processing (downstream failures do not trigger refunds)
- The daily quota DO fails open when unavailable — the abuse gate still protects Supabase,
  and daily quotas are product entitlements, not database-integrity boundaries
- Usage observability goes to `public.api_usage_daily` (not a limiter itself)

---

### C. Pages / Nitro shared app endpoints

Used for browser/app read endpoints served by Cloudflare Pages Functions.

```mermaid
flowchart TB
  B[Browser] --> R["/api/team/members<br/>/api/profile/*<br/>/api/tarkov-dev/profile<br/>/api/logs/client"]
  R --> S[sharedEdgeStore.consumeSharedRateLimit]
  S -->|preferred| DO[API_GATEWAY_LIMITER DO binding]
  S -->|fallback| MEM[In-memory Map in isolate]
  R --> DATA[Supabase REST / app data]
```

| Endpoint                       | Prefix / key style                                                                                          | Default                                                      | Env override                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `/api/team/members`            | `team-members-rate:*`                                                                                       | 120 / min                                                    | `NUXT_TEAM_MEMBERS_RATE_LIMIT_PER_MINUTE`                                                      |
| `/api/profile/[userId]/[mode]` | `shared-profile-rate:*`                                                                                     | 120 / min                                                    | `NUXT_SHARED_PROFILE_RATE_LIMIT_PER_MINUTE`                                                    |
| `/api/tarkov-dev/profile`      | `tarkov-dev-profile-verification-rate:*` + `tarkov-dev-profile-rate:*` + `tarkov-dev-profile-hourly-rate:*` | 5 / min / IP (verification) or 5 / min / IP + 20 / hour / IP | `NUXT_TARKOV_DEV_PROFILE_RATE_LIMIT_PER_MINUTE`, `NUXT_TARKOV_DEV_PROFILE_RATE_LIMIT_PER_HOUR` |
| `/api/logs/client`             | `client-logs-rate:ip:...`                                                                                   | 10 / min / IP                                                | fixed in route                                                                                 |

Implementation: `app/server/utils/sharedEdgeStore.ts`

Important:

- When the DO binding is present, enforcement is shared across isolates. `/api/team/members`,
  `/api/profile/[userId]/[mode]`, and `/api/tarkov-dev/profile` pass the binding via
  `getRateLimiterBinding`; `/api/logs/client` intentionally stays on the Cache API + in-memory
  fallback.
- Without it, fallback is best-effort in-memory and can under-enforce under concurrency or restarts.
- When Turnstile is configured, the `tarkov-dev-profile-verification-rate` limit (5/min/IP) runs
  before siteverify and **replaces** the regular per-minute limit for that branch; the two
  per-minute limits never stack. Without Turnstile, the regular per-minute limit applies.
- These limits protect **app endpoints**, not the external progress API.
- `/api/tarkov-dev/profile` layers more than the rate limit: a 15-minute shared edge cache for
  profile payloads (`NUXT_TARKOV_DEV_PROFILE_CACHE_TTL_MS`, 404s negative-cached 60s, browser
  `Cache-Control: private`), an `updated`-age freshness gate
  (`NUXT_TARKOV_DEV_PROFILE_MAX_UPDATED_AGE_DAYS`, default 7, `0` disables), and optional
  Cloudflare Turnstile verification (production requires paired `NUXT_PUBLIC_TURNSTILE_SITE_KEY`
  and `NUXT_TURNSTILE_SECRET_KEY` values). See `docs/SYSTEMS.md` §7 for the full flow.
- Most static game-data routes (`/api/tarkov/*`) are not enrolled in this limiter. They are served
  through `edgeCache` with CDN/WAF abuse protection and have no route-specific rate limit. The
  `/api/tarkov/cache-meta` endpoint is an exception — it queries Supabase directly and relies on its
  own `Cache-Control` headers.

---

### D. Account deletion limiter

`account-delete` currently uses a **dedicated** path:

1. Call `consume_account_deletion_attempt` to serialize each user's requests in Postgres
2. Allow and record max **3 attempts / 60s** in the same transaction
3. Atomically claim the deletion job through `claim_account_deletion_job`

This is **not** wired through `consume_mutation_rate_limit` today. It remains a second pattern for
“sensitive mutation limiting” because the dedicated table also retains the deletion audit history.
Both RPCs are service-role-only. A job claim holds a 15-minute lease; the reconciler can recover a
stale `in_progress` job after that lease, but a fencing token prevents the stale worker from
overwriting its replacement. Only an explicit user request can reset and revive dead-lettered work.

Preferred future shape: add an `account-delete` scope to the shared mutation limiter and keep
`account_deletion_attempts` only if audit history is still needed.

---

### E. Hard DB invariants (not QPS limits)

These are correctness rules that survive any Edge/Worker outage:

| Rule                         | Mechanism                               |
| ---------------------------- | --------------------------------------- |
| Max 3 active API tokens      | DB trigger / constraint on `api_tokens` |
| One membership per user+mode | unique index                            |
| Row ownership                | RLS policies                            |
| Discord link uniqueness      | unique constraint                       |

Do not replace these with rate limits.

---

### F. Supabase Auth platform limits

Configured in `supabase/config.toml` under `[auth.rate_limit]`:

- `sign_in_sign_ups`
- `token_refresh`
- `token_verifications`
- email / SMS / anonymous / web3 caps

Session lifetime controls (inactivity / timebox) are **auth garbage-collection policy**, not API
rate limits. They reduce long-lived sessions and refresh-token history growth.

---

## What does _not_ belong where

| Do this                                                        | Don’t do this                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Put external API QPS limits in the Worker DO                   | Put high-QPS API throttling in Postgres                      |
| Put team/token mutation abuse limits in Edge + durable counter | Rely on client button disables for security                  |
| Put public profile scrape limits on the Pages endpoint         | Count those requests against supporter daily API quotas      |
| Keep Auth login limits in Supabase Auth                        | Build a second login limiter in app code without reason      |
| Keep hard token caps in DB triggers                            | Soften security by “rate limiting instead of enforcing caps” |

---

## Conflict / double-count guidance

Today these systems mostly **do not stack on the same request**:

```mermaid
flowchart LR
  R1[External token progress call] --> L1[Worker DO only]
  R2[UI team/token mutation] --> L2[Edge mutation_rate_limits only]
  R3[UI shared profile read] --> L3[Pages shared limiter only]
  R4[Login / refresh] --> L4[Supabase Auth only]
```

You can still get confusing UX if:

1. the same human action eventually touches two systems over time (create token limited by Edge;
   later progress polling limited by Worker quotas)
2. client fallbacks skip Edge and then only the DB hard cap remains
3. docs/agents talk about “the rate limiter” without specifying which one

When debugging a `429`, identify **which edge returned it** first:

| Symptom source                                                      | Likely enforcer             |
| ------------------------------------------------------------------- | --------------------------- |
| `api.tarkovtracker.org` response with `X-RateLimit-*` daily headers | Worker DO                   |
| Edge Function JSON `{ error: "Too many requests..." }`              | `mutation_rate_limits`      |
| Pages `/api/profile` or `/api/team/members` 429                     | sharedEdgeStore limiter     |
| Auth/login failures / refresh storms                                | Supabase Auth               |
| Token create 409 “Token limit reached (3 active)”                   | DB hard cap, not rate limit |

---

## Decision guide for new work

When adding a new endpoint or mutation, pick **exactly one** primary enforcer:

```mermaid
flowchart TD
  START[New endpoint or mutation] --> Q1{Who calls it?}
  Q1 -->|External token clients| API[Worker DO quotas]
  Q1 -->|Browser authenticated write| MUT[Edge mutation limiter]
  Q1 -->|Browser/public read| PAGE[Pages shared limiter]
  Q1 -->|Login / identity| AUTH[Supabase Auth limits]
  Q1 -->|Destructive irreversible| DEST[Dedicated destructive limiter<br/>or mutation scope]
  MUT --> HARD{Needs absolute integrity cap?}
  API --> HARD
  DEST --> HARD
  HARD -->|yes| DB[Add/keep DB invariant]
  HARD -->|no| DONE[Document owner + limits here]
  PAGE --> DONE
  AUTH --> DONE
  DB --> DONE
```

Checklist for every new limiter:

1. Name the traffic class
2. Choose the enforcer from the ownership matrix
3. Define key (`userId`, `ip`, `token owner`, etc.)
4. Define limit + window + fail-open/fail-closed behavior
5. Document it in this file and, if external, in `API.md`
6. Avoid inventing a third backend “because it was convenient”

---

## Operational notes

### Fail behavior

| System                          | On limiter failure                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge mutation RPC error         | Edge returns **503** “Rate limiter unavailable” (fail closed for that mutation)                                                                                         |
| Worker DO timeout / error       | Daily quota DO fails open (product entitlement, not DB-integrity boundary). Abuse gate still protects Supabase. Structured `daily_quota_unavailable` warning is logged. |
| Pages shared limiter without DO | Falls back to in-memory best effort                                                                                                                                     |

Treat these deliberately; do not “make everything fail open” without understanding abuse impact.

### Observability

| System                   | Where to look                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| External API throttles   | Worker logs (`daily_quota_429`, `abuse_gate_429`), `api_usage_daily`, admin API usage endpoint |
| Mutation throttles       | Edge Function logs (`[rate-limit] ...`), `mutation_rate_limits.updated_at`                     |
| Pages endpoint throttles | Pages/Nitro logs from sharedEdgeStore warnings                                                 |
| Account delete throttles | `account_deletion_attempts`                                                                    |
| Auth storms              | Supabase Auth logs / dashboard                                                                 |

### Cleanup / retention

| Store                       | Retention guidance                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mutation_rate_limits`      | 1 day past `reset_at`, enforced nightly at 03:30 UTC by the `mutation-rate-limits-cleanup` pg_cron job                                                                                                                                                                      |
| `api_usage_daily`           | 180 days, enforced nightly at 03:15 UTC by the `api-usage-daily-cleanup` pg_cron job                                                                                                                                                                                        |
| Worker DO state             | Ephemeral keys self-clean via alarms; retained authenticated keys expire by window logic                                                                                                                                                                                    |
| Legacy burst/IP DO keys     | Removed in the single daily-quota refactor and never re-addressed; gateway-created retained keys did not schedule cleanup alarms, so their finite orphaned state persists until the staged cleanup in [#594](https://github.com/tarkovtracker-org/TarkovTracker/issues/594) |
| `account_deletion_attempts` | Existing cleanup function / retention policy                                                                                                                                                                                                                                |

---

## Source map (code)

| Concern                                | Location                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutation limit constants + Edge helper | `supabase/functions/_shared/rate-limit.ts`                                                                                                                          |
| Mutation RPC + table                   | `supabase/migrations/20260404120000_add_mutation_rate_limit_rpc.sql`                                                                                                |
| Edge consumers                         | `supabase/functions/{token-create,token-revoke,team-create,team-join,team-leave,team-kick,team-disband}/`                                                           |
| Frontend mutation callers              | `app/composables/api/useEdgeFunctions.ts`                                                                                                                           |
| Worker tier constants                  | `workers/api-gateway/src/limits.ts`                                                                                                                                 |
| Worker entrypoint and routing          | `workers/api-gateway/src/index.ts`, `workers/api-gateway/src/router.ts`                                                                                             |
| Worker authentication and quotas       | `workers/api-gateway/src/authentication.ts`                                                                                                                         |
| Worker DO enforcer                     | `workers/api-gateway/src/rateLimiter.ts` (`ApiGatewayRateLimiter`)                                                                                                  |
| Worker response and cache handling     | `workers/api-gateway/src/responses.ts`                                                                                                                              |
| Pages shared limiter                   | `app/server/utils/sharedEdgeStore.ts`                                                                                                                               |
| Pages consumers                        | `app/server/api/team/members.ts`, `app/server/api/profile/[userId]/[mode].get.ts`, `app/server/api/tarkov-dev/profile.get.ts`, `app/server/api/logs/client.post.ts` |
| Account-delete limiter                 | `supabase/functions/account-delete/index.ts`                                                                                                                        |
| Auth platform limits                   | `supabase/config.toml` `[auth.rate_limit]`                                                                                                                          |
| External API docs                      | `docs/API.md`                                                                                                                                                       |

---

## Target state (keep this simple)

```text
Browser UI
  ├─ sensitive writes  → Supabase Edge → mutation_rate_limits (+ DB invariants)
  ├─ shared/public reads → Pages/Nitro → DO/shared limiter
  └─ auth             → Supabase Auth platform limits

External clients (API tokens)
  └─ api-gateway Worker → IP abuse gate → DO daily quota → Supabase data

Hard rules always in DB:
  active token cap, RLS, uniqueness, deletion job integrity
```

Do **not** collapse everything into a single global limiter. Keep the four planes separate:

1. **External API quotas**
2. **App mutation abuse limits**
3. **App public/shared read limits**
4. **Auth / platform limits**

That separation is what prevents inconsistent double-throttling and makes ownership obvious.
