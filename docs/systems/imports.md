# Progress imports

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Stash screenshot import

Needed Items → Import items from a screenshot reads one PNG, JPEG, or WebP on the device. Players
drop, paste (Ctrl+V or the clipboard button) or choose the image, check the detected items, then
pick how to save them. A dedicated worker decodes bounded pixels, detects grid regions, and
matches the MIT-licensed Cultist Circle recognition features against static, hashed catalog shards. Screenshots,
pixel features, and corrections are neither uploaded nor persisted. The save contains
reviewed requirement counts, an image fingerprint, and an idempotency key.

**Try demo screenshot** loads the bundled, user-supplied 2560×1440 screenshot through the same
worker and review/preview flow. Demo counts cannot be saved. Choosing a personal screenshot
leaves demo mode; a late or cancelled demo download cannot replace that selection. The original
PNG is at `public/img/demos/stash-1440p.png` and is also the offline regression fixture.

### Read-only sell view

The scan review starts with **What can I sell?**. This is scoped to the selected mode,
visible screenshot and the loaded task and hideout catalog. Story chapters and Seasonal perks
have their own requirements and are outside this view.
It reads the full metadata catalog rather than the filtered Needed Items/import target set.
Unfinished tasks protect accepted alternatives, later/conditional quests, required keys,
weapon-build components, item categories and equipment. Unfinished hideout modules protect
their requirements.
Collected counts never establish a physical surplus. No surplus recommendations are made.

Only settled identities and valid known unit counts can appear. Excluded/empty, unknown,
overlapping or duplicate-key observations do not contribute; distinct observations of one item
are grouped once. An item referenced by any remaining requirement stays protected regardless
of its FIR status or observed amount. A completed task/objective or built hideout module may
release its cataloged use; merely filling its count does not. Missing/changing requirement data
withholds the answer. Unfinished tasks with empty objectives, untyped objectives or unmapped
item objectives are reported by quest name. Changing the game mode withholds the sell view
until the importer is reopened. If a pending weapon build requires an item category, only items
with known categories outside all such requirements are eligible for advice. A verified
quest-inventory-only annotation can cover a quest objective whose exact item template is
unknown. Ordinary item, equipment, key and craft-input references still protect stash items.

The panel only reads state: it does not plan, allocate, fetch prices, save counts, or upload
screenshots. The normal review, selected-target preview and explicit save are unchanged.

### Review and allocation

- Recognition scores route review attention; they are not probabilities. Uncertain identities
  and unread stack counts need correction. Quantities are units, never durability or remaining
  uses.
  FIR comes from the found-in-raid checkmark: each region's bottom-right corner, including the
  spot above a stack or uses count, is correlated with the measured mark (`firMark.ts`). Only a
  clear mark sets FIR. Every other region starts as FIR unknown, including items without the
  mark, covered marks and slots under 40 px; unknown FIR can fill only non-FIR requirements.
  Players set FIR or Not FIR for those, and can change any status.
  Totals above 1,000,000 units per item block Preview until quantities are corrected.
- Grid detection also accepts a grey border beside a brighter coloured item frame (newer
  clients at 1440p) and a ridge up to `pitch / 40` pixels off its lattice line (JPEG blur).
  Short-name text is compared both as captured and two template rows lower, where in-game
  labels sit relative to Tarkov.dev icons.
- A suggestion is confident on its combined score, or on one decisive signal when the other is
  spoiled: art of at least 0.97 that leads every other candidate's art by 0.3 (a label the game
  renders differently), or a label of at least 0.93 that leads by 0.12 (a tinted or modded
  weapon). Items that share an icon or a short name tie on that signal and stay uncertain.
- Stack counts are read from the bottom-right corner (`stackCount.ts`): right-aligned digits
  across the full inner width of the item, matched against digit shapes averaged from catalog
  labels. A clear corner, or a FIR mark in the corner itself, means one item. Look-alike digits
  (0, 5, 6, 8 often), slashes as in `10/10`, other ink near the count, another digit on its
  baseline (a spaced thousands group), a count within 3 template px of the cell's left edge,
  and slots under 48 px leave the amount for the player. A count above the item's stack size
  is ignored, and a plain number other than 1 on an item that cannot stack sends the row to
  review.
- Every uncertain or unidentified item blocks Continue, even when none of its suggestions is
  needed. A top-five shortlist cannot establish that an item is irrelevant. Unread or invalid
  quantities also block, including an impossible count on an otherwise confident suggestion.
  Only fully settled, unneeded items appear under "Not needed" and stay out of the totals.
  Confirming the item and amount or explicitly excluding the region settles review.
- Users can search the indexed catalog, exclude regions, split merged detections, and draw a
  manually sized item region when detection fails. Keyboard users can enter region coordinates
  and slot dimensions. Regions and split parts must be at least 8 pixels wide and high.
  Redrawing replaces overlapping regions; quantity corrections preserve requirement selections.
  Redrawn or split rows get fresh review state even when their bounds stay the same; untouched
  rows retain their corrections.
- Each import updates explicitly selected requirements using the existing Smart Fill
  priority/allocation policy, in one of two player-chosen modes:
  - **Set counts from screenshot** (default) replaces each selected requirement's count with its
    allocation from the screenshot. Re-running it with the same totals is idempotent. Decreases
    require confirmation.
  - **Add to current counts** fills only each requirement's missing units on top of its current
    count (`distributeItems(..., { additive: true })`). Counts never decrease. Repeating it with
    another screenshot of the same items adds again; the identical-file receipt check below is
    the only duplicate protection.
- Both modes allocate physical observations once across the selection. A hideout part ticked
  complete without a stored count counts as full, as on the Hideout page, so add mode skips it
  and set mode shows any lower count as a decrease. The save step shows the live
  per-requirement before/after counts for the chosen mode. Save snapshots those numbers before
  reading the cloud baseline and refuses to send anything different. Any change to the
  decreasing requirements clears the decrease acknowledgement.
- Unobserved items and unselected requirements remain unchanged. Completed tasks/modules,
  teammate-only needs, weapon builds, alternative-item objectives, and non-handover task
  objectives are excluded. Closed containers and off-screen inventory cannot be inferred.
- Scanning is available to guests, but saving requires a signed-in, synchronized account.
  Saving fixes the owner, game mode, active season, import mode, selected targets, and progress
  snapshot. If another device changed progress first (`baseline_changed`), the dialog
  reconciles, refreshes the shown counts and asks the player to save again. A screenshot
  imported before a progress reset (`progress_reset`) cannot be saved again while its receipt is
  retained (100 imports, 90 days), so the dialog explains that and disables Save instead of
  looping. That block survives failed refreshes and later recovery retries. Other conflict reasons
  reconcile and allow a fresh save with a new import ID.

### Persistence

`commit_stash_item_import` locks the owner's account and destination mode, checks the full
expected JSON snapshot, validates bounded count updates, and saves counts and receipt in one
transaction. A changed destination rejects the preview. Replayed import IDs return the live
progress snapshot; identical pixel fingerprints are recognized within the same mode/season
and reset epoch. Receipts retain the latest 100 imports per account. They are usable for 90
days; expired rows are pruned lazily on a later import call and may remain stored until then.
Set-counts mode does not inflate counts even after receipt expiry or a differently compressed screenshot.
The RPC always writes absolute counts; add mode computes them in the browser from the
snapshot the RPC checks, so a stale baseline is rejected rather than added to.
Commit and receipt lookup share an owner-scoped limit of 60 calls per minute, enforced before
request hashing and owner locks. Replays, duplicates, and conflicts also consume this budget.

The migration also rejects an exact pre-import objective record arriving through stale
ordinary sync while its receipt remains retained. New timestamped manual edits and explicit
reset epochs remain valid. This guard is intentionally import-specific, not a replacement
for the general sync merge policy. It hashes only changed objective keys and uses indexed
receipt containment, preserving protection from older retained imports. Receipt lookup is
owner-only; raw receipts are private.

While reconciliation is required, ordinary sync rejects detached imperative snapshots with
`null` and a warning; callers must merge changes into the store and retry after reconciliation.
It never silently substitutes the store for a caller-supplied detached snapshot.

### Files and validation

- `app/features/stash-import/` — review, selection, preview, and save adapter.
- `app/workers/stashScan.worker.ts`, `app/utils/stashScan/` — local decoding and recognition.
- `scripts/stash-scan/build-index.ts`, `public/stash-scan/` — offline catalog build and assets.
- `supabase/migrations/20261115033731_commit_stash_item_import.sql` — atomic save and receipts.
- `supabase/tests/database/stash_item_import.test.sql` and
  `scripts/checks/stash-item-import-concurrency.mjs` — transaction and real-lock regressions.

Rebuild assets with `pnpm stash-scan:build-index` using the current `json.tarkov.dev` regular
item catalog and English names. Remote grid images come only from `assets.tarkov.dev`. A pinned
local supplement for Pile of meds is also indexed, retaining the original upstream template.
It uses the same artwork with current cache framing and a separately rendered label, avoiding
bright art strokes contaminating the old label features. Provenance and reproduction are in
[`scripts/stash-scan/references/README.md`](../../scripts/stash-scan/references/README.md); the
builder verifies the supplement's hash before decoding it. No game files or fonts are read at
runtime. The manifest lists items with unusable templates; they remain available for manual correction.
Each shard is written to a temporary file and atomically replaced; the manifest is replaced last,
so an interrupted build preserves the last complete index. Successful publication prunes only
obsolete content-addressed shard files; icon downloads are streamed with a 4 MB limit.
Cached images and ETags are replaced atomically, with the complete image published first.
An exclusive `public/stash-scan/.build-lock` directory covers the whole build, including cache
writes and shard pruning. A second builder fails with `EEXIST`. The lock's `owner.json` records
the hostname, PID and acquisition time for recovery after an interrupted process. Locks never
expire automatically: elapsed time or PID reuse must not let a second build steal an active lock.
For recovery, inspect `owner.json` inside that lock directory on its recorded host, verify
the owning process has exited and no other catalog builder is using this output, then delete
only `owner.json` and the now-empty `.build-lock` directory. If the owner file is missing or
incomplete, establish that all builders using this output have stopped before removing it.
When ownership cannot be verified, leave the lock intact. Do not recursively remove the output.
Feature version 2 recenters cropped rotated-label templates.
Catalog files are content-addressed and loaded by detected slot size. This first catalog is
English and regular-mode based; mode-exclusive items absent from it cannot be identified.
Accuracy across languages, game updates, compression, UI scaling, and tooltips must be
measured with representative labeled screenshots. Synthetic parity does not prove it.
`scripts/stash-scan/screenshot.test.ts` detects the full grid in the unmodified demo PNG, then
uses the real catalog shards to match and count the five documents at their detected cells.
It also checks current meds matching, the old-reference skip regression, flash-drive ambiguity,
and scaled/JPEG copies. The PNG is a calibration fixture, not held-out accuracy evidence. The
checked-in original is never recompressed by the test.

### Rollout and rollback

Apply the additive migration before deploying the importing frontend. To roll back the feature,
restore the previous frontend and retain receipts and the stale-sync guard so older queued writes
cannot undo completed imports. No data backfill or destructive down migration is required.

If the RPCs must also be disabled, ship this as a reviewed forward migration through the normal
deployment pipeline. Revoke both public wrappers and private implementations; do not drop the
trigger or receipt table. The database regression suite rehearses denied calls, preserved progress,
and restoring the grants by rolling back the rehearsal transaction.

```sql
BEGIN;
REVOKE EXECUTE ON FUNCTION
  public.commit_stash_item_import(text, integer, uuid, text, jsonb, jsonb),
  private.commit_stash_item_import(text, integer, uuid, text, jsonb, jsonb),
  public.get_stash_item_import(text, integer, uuid),
  private.get_stash_item_import(text, integer, uuid)
FROM authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
```

## Tarkov.dev profile import

**Summary.** Settings → Data Management lets a user import their in-game profile (level derived
from cumulative XP, skills, faction, prestige, edition guess) from tarkov.dev's player-profile snapshots on the
players.tarkov.dev host (the `profile/{aid}` path for PvP, `pve/{aid}` for PvE, and
`pvp-season/{aid}` for Seasonal, each with a JSON suffix). Profile URLs fix the target mode, so
Seasonal snapshots write only into active Seasonal progress. Opening the matching player page on tarkov.dev is the documented refresh workflow (Turnstile-guarded
there); refetching here retrieves that snapshot, not live game progress. Snapshot freshness is
checked independently, and propagation timing is not guaranteed.
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
- Cached and upstream `200` payloads must pass the import profile schema before use. Cumulative
  `info.experience` must be a nonnegative safe integer (zero is valid); negative, fractional,
  non-finite, or imprecisely represented XP is rejected before deriving level or applying progress.
  Invalid cached entries are treated as misses, and invalid upstream payloads fail without
  entering shared cache.
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
[TarkovMonitor's message type contract](https://github.com/the-hideout/TarkovMonitor/blob/master/TarkovMonitor/GameWatcher.cs).
The importer accepts legacy/rotated notification and backend filenames, and application/output
context, in folders, individual files, and ZIPs. Explicit `output|notifications|` and
`output|push-notifications|` mirrors are another source of the same quest evidence; their
application/backend source prefixes are also unwrapped for routing. Generic output chatter is
not a notification. Dedicated and mirrored deliveries share identity/time deduplication.
Folder files and ZIP members are read incrementally under the [selection-wide budgets](#eft-log-import-resource-budgets).
Raw reads and decoded batches use 256 KiB buffers; compressed ZIP inflation uses 1 KiB slices.
These buffer sizes are separate from the import budgets.
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
rebuilds previews from that evidence without rereading files. Mode, quest-state, and history
selection also reuse that evidence. Memory still scales with meaningful
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
All destination catalogs are loaded before mutations, without changing the active metadata store.
An explicit completion notification can also recover a catalog-missing task whose exact ID is
configured to unlock a trader in that destination mode. This completion-only allowlist comes from
`TRADER_UNLOCK_TASKS`; Ref uses its mode-specific ID. Recovery writes only that task's completion
through the existing progress store, without fabricating task metadata or inferring objectives,
prerequisites, player level, trader standing or story progress. Arbitrary missing IDs and missing-task
start/failure events remain ineligible. Later failures/restarts still supersede older completions
before eligibility/state filtering. Account/version selection, reset cutoffs, Seasonal history,
explicit unresolved-mode routing and whole-catalog validation apply unchanged; a failed destination
catalog load still prevents all writes. The log is user-selected evidence for their own progress,
not an authenticated game-server attestation. There is no new cross-account or API write authority.
`/api/tarkov/tasks-import` reads one English precomputed snapshot for each requested upstream mode.
The producer combines core fields, objectives and fail conditions from one raw task set, then applies
the private overlay once. Import never joins the independently cached UI core/objective projections.
Snapshot validation follows the [producer contract](./overlay-and-precompute.md#key-and-activation-contract). Missing provenance,
duplicate task/objective IDs, invalid counts, wrong scope, corrupt data or a
snapshot older than seven days rejects the preview before any progress or mode change. Failed
refreshes retain each mode's last-good entry. Runtime use of a whole last-good snapshot does not
require its global overlay SHA to match the separately cached UI release; a non-task overlay change
cannot cause an import outage by itself. The snapshot route and request are `no-store`, and the
route never runs upstream adaptation on a Worker request. Seed the three import keys from the
reviewed app revision before promoting it (see [overlay and precompute](./overlay-and-precompute.md)).
The browser objective cache uses `TASK_OBJECTIVES_CACHE_VERSION` (`neutral-v2`) to retire
earlier cached references. The endpoint serves objectives from the activated neutral release.
Destination catalogs determine task eligibility and objective counts, and the original progress
mode is restored. Application is not transactional across modes:
failures explicitly warn that some progress may remain applied. Users can select the same logs
to retry; state-setting operations preserve successful completions.
Seasonal events outside the active season are skipped; assigning unresolved out-of-season
events to Seasonal is blocked. Preview counts exclude those events and the shared confirmation
guard shows the date warning and disables confirmation immediately for an invalid selection.
The guard examines only selected history/states; excluded unidentified events cannot block an
otherwise valid import.
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
four-character suffix. Switching accounts resets version and data selection to that account's defaults.

### EFT log import resource budgets

`app/utils/eftLogImportBudget.ts` caps a selection at 1 GiB supported input, 1 GiB actual expanded bytes, 100,000 evidence items, 16 Mi UTF-16 evidence characters, 8,192 files and archive entries, and 1 Mi UTF-16 characters in aggregate names. Count ignored entries and duplicate events and mode signals before retention. Charge expanded bytes before decoding and copy retained strings to release decoded batches.

Filesystem reads and decoded batches are 256 KiB, with 1 KiB compressed inflation slices and an independent 8 Mi-character unfinished-record ceiling. Yield after expanded batches and check cancellation between slices. Ignore unsupported entries without inflating them. An exceeded budget aborts the whole selection without a partial preview or progress write. Retry with fewer sessions or only relevant files.

Use privacy-normalized fixtures. Never commit raw logs. An October 2026 sample through build `1.2.0.0.47965` verified started and completed notifications, with mirrored output as a recovery source. Failure coverage comes from fixtures. No usable self-XP, prestige reset, partial handover, or hideout completion evidence was established.

### Preview selection and reset history

- Users can include/exclude detected PvP, PvE, Seasonal, and unidentified-mode evidence, and
  completed, started/active, or failed quest states. Known modes default on. Unidentified events
  default off when eligible known-mode evidence exists; all selected unidentified histories require an
  explicit destination choice, including mixed logs. The destination must remain included;
  excluded modes are never switched into or mutated.
- Saved cutoffs remain editable when a version filter removes that mode's events.
- A per-destination **import since** time is an inclusive lower bound, entered in browser-local
  time. It applies to the original notification time (`dt`) when available, otherwise the receipt
  timestamp; undated evidence is excluded when a cutoff exists. Unidentified evidence uses its
  chosen destination's cutoff. Clearing a cutoff includes all selected history for that mode.
- Mode/history filters run before destination reconciliation. State filters run **after** choosing
  each quest's latest state, so excluding a later failure/restart cannot resurrect an earlier
  completion. Preview totals and confirmation use the same selection helper. Empty selections
  disable confirmation and the composable rejects them before any progress/mode mutation.
- Selections are transient and locked during application. Cutoffs do not reset saved progress or
  change prestige; existing completed tasks remain preserved. Reset existing tracker progress
  separately if restoring a new character generation.
- Version filters are compatibility filters, not wipe/prestige boundaries. No verified
  self-prestige/reset event was established by the corpus: `/client/prestige/list` is a catalogue
  request; `PrestigeLevel` in friend/group snapshots may describe other players. Neither clears
  quests nor assigns the importing user's prestige. Do not infer reset boundaries from build
  versions or a profile ID changing between modes.

Completed-task imports restore objectives and may infer prerequisite states, minimum level/trader
requirements, and story gates. They do not provide exact self XP, skill snapshots, partial objective
handovers, or hideout progress. Missing history remains missing. If combining log and profile
imports, apply the selected logs first, then a refreshed matching profile to align level/skills to
that snapshot. The profile importer derives and saves the level from cumulative profile XP.
