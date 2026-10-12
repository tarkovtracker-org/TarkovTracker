# Progress imports

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Tarkov.dev profile import

**Summary.** Settings → Data Management lets a user import their in-game profile (level/XP,
skills, faction, prestige, edition guess) from tarkov.dev's player-profile snapshots on the
players.tarkov.dev host (the `profile/{aid}` path for PvP, `pve/{aid}` for PvE, and
`pvp-season/{aid}` for Seasonal, each with a JSON suffix). Profile URLs fix the target mode, so
Seasonal snapshots write only into active Seasonal progress. The upstream JSON only refreshes when
a human views the player page on tarkov.dev
(Turnstile-guarded
there); tarkov.dev purges its CDN copy on refresh, so a new snapshot is visible to us immediately.
The upstream sends no CORS headers, so the browser cannot fetch it directly — everything goes
through the Nitro proxy `/api/tarkov-dev/profile`, which layers cost and abuse controls.

### Flow

1. Client (`useTarkovDevImport.parseProfileUrl`) resolves the pasted URL to the upstream JSON URL,
   checks the per-profile client cooldown (localStorage, default 60 min after a confirmed import,
   `NUXT_PUBLIC_TARKOV_DEV_IMPORT_COOLDOWN_MINUTES`), obtains a Turnstile token when a sitekey is
   configured, and calls the proxy with `retry: 0`.
2. The proxy enforces, in order: a pre-verification per-IP rate limit when Turnstile is configured,
   Turnstile verification (production requires `NUXT_PUBLIC_TURNSTILE_SITE_KEY` and
   `NUXT_TURNSTILE_SECRET_KEY` to be paired; siteverify availability failures fail open), then the
   hourly per-IP limit. Without Turnstile, the normal minute limit runs in the first position. The
   separate `tarkov-dev-profile-verification-rate`, `tarkov-dev-profile-rate`, and
   `tarkov-dev-profile-hourly-rate` buckets use the DO binding when available. The shared edge cache
   follows (`tarkov-dev-profile` prefix,
   default TTL 15 min, `NUXT_TARKOV_DEV_PROFILE_CACHE_TTL_MS`; upstream 404s are negative-cached
   for 60 s).
3. On cache miss it fetches upstream with the shared User-Agent, which identifies the deployment
   using the origin from `APP_URL` (or `CF_PAGES_URL`). Missing, malformed, and local addresses
   retain the upstream `https://tarkovtracker.org` identity. With `?fresh=1` (sent by the
   client for explicit refetches and automatically after a stale rejection), serving from cache is
   skipped; the cache is still read to obtain the ETag for conditional `If-None-Match` revalidation.
   A `304` re-stamps a fresh cached entry without extending a payload that fails the freshness gate.
4. The freshness gate rejects payloads whose `updated` field is older than
   `NUXT_TARKOV_DEV_PROFILE_MAX_UPDATED_AGE_DAYS` (default 7, `0` disables) with a structured
   `422 profile_stale` error. Ordinary successful responses get
   `Cache-Control: private, max-age=<ttl>` so repeat clicks are served from the browser cache;
   explicit `fresh=1` responses and all error paths stay `no-store`.
5. The client parser surfaces `updated` as `updatedAt`; the preview UI shows the snapshot date and
   warns when it is 2+ days old. Structured error codes (`profile_stale`, `profile_not_generated`,
   `rate_limited`, `cooldown_active`, `turnstile_failed`) map to localized, actionable messages.

### Files

- `app/server/api/tarkov-dev/profile.get.ts` — proxy: limits, Turnstile, cache, freshness gate
- `app/server/utils/turnstile.ts` — siteverify wrapper (fail-open on availability errors)
- `app/utils/tarkovDevProfileSource.ts`, `app/utils/tarkovDevProfileParser.ts` — URL resolution and
  payload parsing (`updatedAt`)
- `app/composables/useTarkovDevImport.ts` — client flow, cooldown check, error-code mapping,
  automatic `fresh=1` retry after a stale rejection
- `app/composables/useTurnstile.ts`, `app/utils/turnstileKeys.ts` — widget lifecycle + test keys
- `app/utils/tarkovDevImportCooldown.ts` — localStorage cooldown bookkeeping
- `app/features/settings/DataManagementCard.vue` — import UI, snapshot age, cooldown countdown
- `docs/rate-limiting.md` — limiter ownership for this route

### Invariants

- The browser never fetches `players.tarkov.dev` directly (no upstream CORS); the proxy is the only
  path, and it never talks to the api-gateway Worker or its daily token quotas — the rate-limit
  buckets are route-specific.
- The shared outbound User-Agent identifies this deployment using the origin from `APP_URL` or
  `CF_PAGES_URL`; missing, malformed, and local values retain the upstream
  `https://tarkovtracker.org` identity.
- A minute-scale limiter always runs before siteverify or any cache/upstream access. When Turnstile
  is enabled it uses the verification bucket, so invalid tokens cannot hammer siteverify while the
  hourly admitted-request quota remains reserved for verified traffic.
- Turnstile enforcement is keyed on the server secret being configured; production config requires
  the public sitekey and private secret together, so the client cannot submit before its widget is
  ready. Without the pair the route behaves as before (no token required). Siteverify availability
  failures allow the request; explicit verification failures reject it with `403 turnstile_failed`.
- Siteverify responses are pinned to the canonical `APP_URL` hostname, so a token minted on another
  origin is rejected with `hostname-mismatch`. Cloudflare's test secret is exempt because it
  reports `example.com` for every origin; it only validates test-key tokens, never production ones.
- Cached and upstream `200` payloads must pass the import profile schema before use. Invalid cached
  entries are treated as misses, and invalid upstream payloads fail without entering shared cache.
- Cached payloads are re-checked against the freshness gate on every serve, so a stale snapshot can
  never be imported from cache either.
- Profile page modes use the centralized upstream slugs `regular`, `pve`, and `pvp-season`; the
  `pvp-season` profile is imported into the stable internal `seasonal` progress mode.
- A `fresh=1` request bypasses serving from cache but not the cache lookup or rate limits, and
  revalidates with `If-None-Match` when a cached ETag exists — "I just refreshed on tarkov.dev"
  costs at most one conditional upstream request.
- The client cooldown is UX only (localStorage); the server-side cache + rate limits are the actual
  cost protection, per the design principle in `docs/rate-limiting.md`.
- Ordinary success responses are browser-cacheable (`private`); explicit `fresh=1` responses and
  error responses never are.
- The client accepts the verified Tarkov.dev `pvp-season` profile source for Seasonal progress.
  Seasonal EFT-log imports use the event and active-season safeguards specified in [EFT log import](#eft-log-import).

## EFT log import

EFT log import restores explicit quest notification states in PvP, PvE, and active Seasonal
PvP. Message types 10/11/12 identify started/failed/completed tasks; rewards, backend requests,
diagnostics, and group-member snapshots do not establish additional player progress. See
`docs/eft-log-reference/` for the audited format inventory (through `1.1.0.1.46911`) and
[TarkovMonitor's message type contract](https://github.com/the-hideout/TarkovMonitor/blob/master/TarkovMonitor/GameWatcher.cs).
The importer accepts legacy/rotated notification and backend filenames, and application/output
context, in folders, individual files, and ZIPs. Folder files and ZIP members are read incrementally without fixed file-count,
file-size, archive-size, or combined-byte limits. Raw reads use 256 KiB slices; compressed ZIP
input uses 16 KiB slices to bound each inflation step. These are buffer sizes, not import limits.
Supported members are consumed immediately; unsupported members use a discard decoder so
fflate cannot retain deferred compressed contents. Declared ZIP sizes never drive allocation;
synchronous decoders reject incomplete streams on final input; supported entries must match
their declared expanded size when present. A bounded
ZIP-tail read validates the end record and comment length before streaming, rejecting empty or
truncated input while accepting valid empty archives.
UTF-8 decoding and timestamp-delimited record framing preserve split characters, headers,
multiline JSON, and final records without a trailing newline. An individual unfinished record
is limited to 8 Mi characters to reject malformed/unbounded records; this fails the selection
explicitly instead of silently skipping history. No progress is applied on reading errors.
Completed text is discarded after extracting quest events and mode signals. Version selection
rebuilds previews from that evidence without rereading files. Memory still scales with meaningful
events, mode evidence, and selected-file metadata, not total source bytes; browser resources and
processing time remain practical limits. Progress reports selected source bytes (compressed bytes
for ZIPs). Cancel or reselection aborts between slices and invalidates pending catalog/preview
work; stale requests cannot update progress or restore cancelled results.
Arena is excluded. Multiline JSON is bounded
by log records so a truncated event cannot consume the next notification.
Mode routing uses preceding explicit session declarations or gateway/WebSocket connections;
legacy prod backend requests remain a fallback when explicit PvP/Seasonal routing is absent.
Unparseable signal timestamps are discarded. Delayed responses and shared mode/locale routes
and URLs inside notification payloads are not switches. Conflicting simultaneous
signals and events before the first signal remain unresolved and require a destination choice.
Original notification message times (`dt`) order replayed history when present; record timestamps
still locate the mode signal. Without `dt`, record time is the fallback.
Stable server event/message identities are deduplicated across modes before progress is
applied; routing follows the earliest receipt, regardless of file order or replay receipt mode.
Sparse fallback identities stay mode-scoped, using receipt time when no original time exists.
Conflicting or unresolved simultaneous deliveries remain unresolved: unknown may represent
contradictory signals, not just absent context, so a partial copy cannot override it. States are
then reconciled per mode and quest after unresolved-mode routing; tied timestamps prefer completed, failed, then started.
Explicit failure notifications use the persistent manual-failure flag so automatic repair cannot
discard them when a triggering quest is missing from the logs. Existing completed tracker tasks
are preserved. Inferred prerequisite completions only write task IDs present in the destination
catalog; explicit imported completion states remain authoritative. Catalogs share metadata hydration's task-qualified duplicate-objective IDs.
All destination task/objective catalogs are
loaded before mutations, without changing the active metadata store. Destination catalogs
determine task eligibility and objective counts, and the original progress mode is restored. Application is not transactional across modes:
failures explicitly warn that some progress may remain applied. Users can select the same logs
to retry; state-setting operations preserve successful completions.
Seasonal events outside the active season are skipped; assigning unresolved out-of-season
events to Seasonal is blocked. Preview counts exclude those events and the shared confirmation
guard shows the date warning and disables confirmation immediately for an invalid selection.
Malformed/skipped records are reported in the preview.
Accounts are separated by the `AccountId` on `SelectProfile`, `PrepareSelectedProfileLocally`,
and `CompleteSelectedProfile` lines in the `application` and `output` channels (`ProfileId`
differs per mode, so it is never the key). Each event belongs to the latest preceding selection
in its session (an event at the same millisecond as a selection stays unidentified),
so an account switch inside one session splits correctly. Quest-event counts cover only the selected account. The preview defaults
to the most recently played account and imports one account at a time (`account: null` selects
every account and is used only to discover destination modes). Events before a session's first
retained selection also remain available in the `unidentified` bucket, alongside sessions with
no recorded selection: it joins the only identified account, but stays
separate when two or more accounts exist. Account IDs stay in memory and are shown only as a
four-character suffix. Switching accounts resets version selection to that account's defaults.
Version filters are compatibility filters, not wipe/prestige boundaries: users must
select the character sessions they intend to restore. Missing logs, objective handovers, XP,
skills, and hideout progress cannot be reconstructed from these quest notifications.
