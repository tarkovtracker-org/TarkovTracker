# Workflows — TarkovTracker

> Key end-to-end processes. Each section names the components involved so you can jump to source.

## 1. App Initialization

```mermaid
sequenceDiagram
    participant Browser
    participant Plugins as Client plugins (NN.*.client.ts)
    participant Stores as Pinia stores
    participant SB as Supabase
    participant Proxy as /api/tarkov/*

    Browser->>Plugins: load in numeric order (00..06, zz last)
    Plugins->>Stores: install Pinia + persistence (01.pinia)
    Plugins->>SB: init Supabase client + auth (supabase.client)
    Plugins->>Stores: start metadata load (metadata.client)
    Stores->>Proxy: fetch tasks-core (phase 1)
    Proxy-->>Stores: core data -> render
    Stores->>Proxy: fetch objectives + rewards (phase 2)
    Plugins->>Stores: preferences sync (zz.preferences-sync, last)
```

Entry points: `app/composables/useAppInitialization.ts`, `app/plugins/*`, `useMetadataStore.initialize()`.

## 2. Game-Data Fetch with Caching + Overlay

```mermaid
sequenceDiagram
    participant Store as useMetadataStore
    participant IDB as IndexedDB (tarkovCache)
    participant Route as /api/tarkov/* (Nitro)
    participant Edge as Cloudflare edge cache
    participant TJ as tarkov-json.ts
    participant OV as overlay.ts
    participant TD as json.tarkov.dev

    Store->>IDB: getCachedData(key=endpoint+mode+lang)
    alt fresh hit
        IDB-->>Store: cached payload
    else miss/expired
        Store->>Route: GET with lang/gameMode
        Route->>Edge: check edge cache
        alt edge hit
            Edge-->>Route: cached response
        else edge miss
            Route->>TJ: fetch + adapt
            TJ->>TD: fetch static JSON
            TJ->>OV: apply overlay corrections
            TJ-->>Route: adapted data
            Route->>Edge: store
        end
        Route-->>Store: { data }
        Store->>IDB: setCachedData
    end
    Note over Store,IDB: /api/tarkov/cache-meta purge timestamp triggers IDB invalidation
```

## 3. Progress Sync (authenticated)

```mermaid
sequenceDiagram
    participant UI
    participant Tarkov as useTarkovStore
    participant LS as localStorage
    participant Sync as useSupabaseSync
    participant RT as Realtime channel
    participant DB as Supabase user_progress

    UI->>Tarkov: mutate (complete task / objective count)
    Tarkov->>LS: persist immediately (local-first)
    Tarkov->>Sync: queue debounced upsert
    Sync->>DB: upsert after debounce
    RT-->>Tarkov: remote change event
    Tarkov->>Tarkov: filter self-origin echo
    Tarkov->>Tarkov: progressMerge (sticky-complete, timestamp, max-value)
    Tarkov->>UI: reactive update
```

Components: `app/stores/useTarkov.ts`, `app/stores/tarkov/{progressMerge,conflictDetection,realtimeListener}.ts`,
`app/composables/supabase/{useSupabaseSync,useSupabaseListener}.ts`.

## 4. OAuth Login (popup with redirect fallback)

```mermaid
sequenceDiagram
    participant Login as login.vue / useOAuthLogin
    participant Popup as OAuth popup
    participant CB as /auth/callback
    participant SB as Supabase

    Login->>Login: loading[provider]=true; start poll/fallback/abandon timers
    Login->>Popup: window.open(provider URL)
    Popup->>SB: provider auth
    SB-->>CB: redirect back
    CB-->>Popup: postMessage(OAUTH_SUCCESS)
    Popup-->>Login: message event
    Login->>Login: cleanup(); navigate to safe redirect
    alt popup blocked / closed early
        Login->>Login: fallbackTimer + !popupConfirmedOpen -> fallbackToRedirect()
    end
```

Detailed timer semantics are documented in `docs/ARCHITECTURE.md`. Redirect targets are validated
(`app/utils/redirect.ts`, `oauthConsent.ts`).

## 5. Team Collaboration

```mermaid
sequenceDiagram
    participant UI as MyTeam.vue
    participant EF as useEdgeFunctions
    participant Fn as Supabase Edge Fn (team-*)
    participant DB as teams / team_memberships
    participant TeamStore as useTeamStore

    UI->>EF: invoke team-create / team-join (invite code)
    EF->>Fn: POST (JWT)
    Fn->>Fn: rate-limit (RPC) + validate
    Fn->>DB: mutate membership (RLS-safe)
    Fn-->>UI: result
    TeamStore->>DB: load teammate profiles (/api/team/members)
    TeamStore->>UI: teammate progress
```

Functions: `team-create`, `team-join`, `team-leave`, `team-kick`, `team-members`. Owner transfer and
membership sync are handled by migrations/RPCs.

## 6. Progress Import (tarkov.dev profile / EFT logs)

```mermaid
sequenceDiagram
    participant UI as Settings DataManagement
    participant Imp as useTarkovDevImport / useEftLogsImport
    participant Proxy as /api/tarkov-dev/profile
    participant TD as players.tarkov.dev
    participant Tarkov as useTarkovStore

    alt tarkov.dev profile
        UI->>Imp: paste profile URL, choose target mode
        Imp->>Proxy: fetch profile JSON
        Proxy->>TD: GET /profile/{uid}.json
        Imp->>Imp: parse (tarkovDevProfileParser) + preview
        UI->>Imp: confirm
        Imp->>Tarkov: apply to chosen mode
    else EFT log files
        UI->>Imp: upload logs/zip
        Imp->>Imp: parse quests (eftLogQuestParser), detect mode/version
        UI->>Imp: confirm included versions
        Imp->>Tarkov: apply parsed completions
    end
```

Notes: only the linked `tarkovUid` is persisted; imports always ask which mode to write into and
default to the active mode; legacy embedded profile blobs are sanitized out. tarkov.dev URL slug:
`regular` → PvP, `pve` → PvE.

## 7. Supporter Payment (Stripe)

```mermaid
sequenceDiagram
    participant UI as Supporter UI
    participant Nitro as /api/stripe/checkout
    participant Stripe
    participant WH as stripe-webhook (Edge Fn)
    participant DB as supporters / stripe_events
    participant Discord

    UI->>Nitro: POST { mode, tier, interval } or { mode:payment, amount }
    Nitro->>Stripe: create Checkout session
    Stripe-->>UI: redirect to checkout URL
    Stripe->>WH: webhook (payment/subscription events)
    WH->>DB: record event (idempotent) + grant/revoke supporter
    WH->>Discord: sync supporter role
    UI->>Nitro: POST /api/stripe/portal (manage subscription)
```

Validation: `app/server/utils/stripeCheckoutValidation.ts`; customer lookup:
`supporterCustomerLookup.ts`; refunds/disputes revoke access in `stripe-webhook`.

## 8. Public API Access (gateway)

```mermaid
sequenceDiagram
    participant Client as 3rd-party client
    participant Settings as ApiTokens.vue
    participant TokenFn as token-create (Edge Fn)
    participant GW as api-gateway Worker
    participant DB as Supabase RPC

    Settings->>TokenFn: create token
    TokenFn->>DB: store SHA-256 hash
    TokenFn-->>Settings: show token once
    Client->>GW: request with Bearer token
    GW->>GW: hash + validate + rate limit (Durable Object)
    GW->>DB: RPC read/update progress
    GW-->>Client: JSON + rate-limit headers
```

## 9. Account Deletion

User requests deletion → `account-delete` Edge Function enqueues a job
(`account_deletion_jobs`) and removes user data; `account-delete-reconcile` reconciles/cleans up
residual data. Rate-limited and audited.

## 10. Localization Workflow

- `app/locales/en.json` is the **only** file to edit (source locale).
- Non-English locales are **Crowdin-owned** exports — never hand-edit or copy English in as a fallback.
- Add user-facing copy as snake_case keys with `t('key', 'Fallback')`, then run `pnpm run i18n:check`
  (fatal only on snake_case violations in `en.json`). vue-i18n falls back to `en`.

## 11. Build, Validate, Deploy

```mermaid
graph LR
    Dev[pnpm run dev] --> Code[edit app/]
    Code --> Hook[husky + lint-staged: prettier + eslint --fix]
    Hook --> Commit[conventional commit]
    Commit --> CI[lint / typecheck / test / validate:openapi]
    CI --> Build[nuxt build]
    Build --> Pages[Cloudflare Pages]
    Build --> Worker[wrangler deploy api-gateway]
```

Pre-finish validation policy (root `AGENTS.md`): run the smallest relevant check — `typecheck` for
TS changes, `lint` for code, `i18n:check` for locale changes. Avoid running the full suite unless
test logic or executable code changed. Formatting is handled by the pre-commit hook.
