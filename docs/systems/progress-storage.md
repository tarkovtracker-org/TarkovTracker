# Progress storage

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Game-mode and Seasonal progress storage

**Summary.** Persistent PvP, PvE, and numbered Seasonal PvP progress share one normalized table.
`user_game_mode_progress` has primary key `(user_id, game_mode, season_number)`; PvP and PvE use
season `0`, while Seasonal uses the active positive season number. Season 1 is active. The
`user_progress` row holds account-wide metadata and the accepted client account-clock contract.
See [legacy retirement](../runbook.md#legacy-pvppve-storage-retirement) for the normalized-reader support boundary.

### Flow

1. Startup reads account metadata and materialized normalized progress. It composes owned local
   copies by clocks/epochs before cloud reconciliation. Missing rows provide no legacy seed.
2. `sync_user_game_mode_progress` verifies ownership and serializes account writes. Send only
   modes whose captured values differ from their acknowledged baseline. The server checks a limit of 60 direct client syncs per user per minute, preserves
   omitted modes and skips a stale Seasonal entry without failing persistent modes. Shared
   background/direct saves compare baselines after earlier writes settle. Matching echoes leave
   pending saves intact. New session, progress or metadata can stop pending split batches.
   See [sync and retry](progress-sync.md#payload-size-and-rejected-saves) for request bounds.
3. The Tarkov UID link uses its own final savepoint. On a duplicate link, progress commits,
   the stored UID remains and `tarkov_uid_conflict` corrects UI, startup and remaining batch
   metadata. Abandoned previews and session changes fence completions.
4. Account Realtime handles metadata only. A matching `metadata_write_id` **and** values
   advance the timestamp watermark without patching. Normalized events require supported
   mode/season. Team events use the single private team channel described in [teams](teams.md).
5. Profile visibility comes from the requested normalized row. Persistent-mode sharing mirrors
   old preference columns both ways during compatibility, but a missing row is private. Public
   and teammate reads check authorization first. Shared-profile reads use HTTPS-normalized
   Supabase URLs and an 8-second deadline through body consumption. Failure cancels sibling reads. Timeouts return 504.
6. Align app `ACTIVE_SEASON` with the database. A new season uses a fresh row and keeps history
   isolated. Verify the database flip before deploying matching app constants in the no-write gap.
   Backup v2 preserves the season stamp and can restore persistent modes from an older backup.
7. Prestige is persistent PvP/PvE only. Archive writes use the account queue, acknowledge their
   written modes and supersede pending captures based on pre-archive state. A committed archive
   reconciles newer same-owner local work. Outside-scope mode changes do not stop it. Session
   fences prevent late dispatch and cross-account result adoption.

### Game profiles

An account's existing progress rows are its default profile; nothing about them changes. A second
EFT account is a non-default profile stored in its own tables, so a reader that does not know about
profiles (gateway, teams, sharing, overlays, Realtime) can never see or mix its data.

- `user_game_profiles`: one row per profile (`is_default`, `label`, `eft_account_id`,
  `game_edition`). The default row is created lazily, when the account binds an EFT account id or
  adds a profile. `eft_account_id` is unique per account, not globally.
- `user_profile_mode_progress`: per-mode progress of a non-default profile, same shape and checks as
  `user_game_mode_progress`, keyed `(profile_id, game_mode, season_number)`. Both tables are
  deny-all; clients use `list_game_profiles`, `add_game_profile`, `update_game_profile`,
  `delete_game_profile`, `get_game_profile_progress`, and `sync_game_profile_progress`.
- Cap: 2 profiles per account (default plus one), enforced in `add_game_profile`. Errors: `PT400`
  invalid label or EFT account id, `PT403` locked, `PT404` unknown profile, `PT409` duplicate or default-profile misuse, `PT422` cap reached.
- Access: `private.game_profiles_unlocked` is true for an active, non-disqualified supporter (same
  rule as `supporterStatus.ts`, using effective prepaid entitlements when that rollout is present) or when `app_settings.game_profiles_access` is `"all"`; a missing
  setting means supporters only. Binding the default profile is never gated. A lapsed account keeps
  its extra profile read-only and can still delete it.
- Preferences and other non-progress settings stay account-global. API tokens and teams still address
  the default profile only; profile-bound tokens and team membership are later changes.

### Files

- `supabase/migrations/20260804043342_normalize_game_mode_progress_and_add_seasonal.sql` — schema,
  RLS, compatibility triggers, `team_member_mode_summary`, sync/sharing/prestige RPCs
- `supabase/migrations/20260830130000_harden_client_progress_access.sql` — authenticated progress
  sync limits, client mutation revocation, and mode-scoped legacy teammate progress RPC
- `supabase/migrations/20261018203633_drop_legacy_progress_columns.sql` - removes only the two
  legacy columns and their reader/trigger/backfill dependencies; keeps account metadata,
  compatibility clocks, normalized progress, all Seasonal history and prestige archives
- `supabase/migrations/20261009020231_retire_legacy_progress_keep_compatibility_clocks.sql` — stops every
  legacy PvP/PvE write and legacy merge seed, and drops the legacy-to-normalized trigger and the
  legacy-only `update_task_completion`, while retaining account clocks for accepted cached clients
- `supabase/migrations/20260910050000_add_manual_activity_history_to_progress.sql` — adds
  `manualActivityHistory` to the persisted progress allowlist and its entry/history sanitizers
- `supabase/migrations/20261012094933_reconcile_game_profile_entitlements.sql` — game profile tables, supporter gate,
  and profile RPCs
- `app/composables/useDataBackup.ts` — season-aware native backups
- `app/workers/backupImport.worker.ts` and `app/utils/backup/` — isolated file import parsing,
  validation, preview summaries and bounded selected-snapshot transfer
- `app/server/api/profile/[userId]/[mode].get.ts`,
  `app/server/api/streamer/[userId]/[mode]/kappa.get.ts`, `app/server/api/team/members.ts` —
  mode-aware sharing and team routes
- `app/utils/constants.ts`, [TarkovTracker-API/src/utils/gameMode.ts](https://github.com/tarkovtracker-org/TarkovTracker-API/blob/v0.1.2/src/utils/gameMode.ts) — runtime active-season
  constants and upstream mode mapping

### Backup file imports

Backup file imports parse and validate in a disposable browser worker, including the nested
raw recovery entries and ownership checks. The ordinary backup ceiling remains 5 MiB; version-1
device recovery archives may be up to 128 MiB with at most 64 older entries. Files above
128 MiB are rejected before starting a worker or reading bytes. Ordinary files between 5 and
128 MiB are format-detected and rejected inside the worker, without parsing on the UI thread.
If the worker cannot start or fails, import reports an error; there is no synchronous fallback.

The worker retains the archive and returns only entry labels and a compact preview. Explicit
confirmation pulls the selected normalized snapshot in batches of at most 64 tokens and fewer
than 16,384 string code units, with one outstanding batch at a time. Unselected archive entries
and raw recovery strings never return to the UI thread. No progress is applied before the full
selected snapshot is received and the preview owner is checked again. Cancellation, replacement
file selection and scope disposal terminate the worker and invalidate pending results.
Retained-copy reads share the same import generation, so late successes or failures cannot
replace a newer file preview or restore a cancelled preview. Recovery archives remain bound to the selecting account; ordinary backups retain their portable import
behavior, with the displayed preview bound to its receiving account. Original archive bytes and
retained device recovery copies are not rewritten or discarded by import.

### Invariants

- Persistent modes use season 0. Seasonal uses the active positive season. Stored off-season
  data is retained for recovery before current-state reset. Unstamped local legacy data follows the
  current season, but the RPC requires a matching caller stamp for Seasonal writes.
- `app/server/utils/gameModeSeason.ts` resolves Seasonal through the service-role
  `get_active_season_number` before cache lookup, then uses that number for the entire request.
  The API Worker also resolves it from the database. Only positive JSON integers are accepted.
  Invalid values or lookup failures return 503. Persistent reads require no lookup.
- Materialized normalized progress has a finite numeric level. Own, public, teammate, overlay and
  gateway readers use normalized rows only. Team access requires a shared team in the same mode.
  Signup does not create placeholder rows. Client mutations go through bounded owner RPCs.
- `merge_progress_data` starts a missing normalized row empty under the account lock. Legacy
  `p_field` names select modes only. Public API writes still advance the account clock.
  Account metadata or persistent-mode changes advance it for browser sync. Seasonal-only and
  identical writes leave it alone. Compatibility clocks and account-row Realtime remain until
  the accepted normalized-client protocol is retired.
- Task completions preserve explicit `active` through local persistence, sync, realtime and sharing.
  Complete, failed and neutral writes clear acceptance. Missing legacy values remain unknown.
  Same-epoch full saves retain omitted unfinished tasks with known acceptance or a positive
  status timestamp. An older save cannot lower the timestamp of an unfinished task, including
  after Undo restores unknown acceptance. Equal-clock legacy entries retain known acceptance.
  Newer status writes and reset epochs keep their precedence. The forward merge also preserves
  saved-level guards, activity epochs and availability confirmations.
- API history allows `active`, `completed`, `failed` and `uncompleted`. Keep the first 20
  valid task updates in input order and report the original `taskCount` if truncated. The
  database preserves a higher stored count for the same ID/timestamp. Keep app, API and SQL
  sanitizers aligned. Manual actions retain immediate feedback without adding feed entries.
- Historical manual activity remains in mode blobs, capped at 50 entries and hidden from the
  feed. Merge IDs only in matching progress/history epochs, then keep the newest entries.
  Equal timestamps sort by ID. Same-ID ties use type, action, title and details in code-point
  order. Clamp by code point and strip lone surrogates before JSONB binding. A history clear
  advances `manualActivityEpoch` only. Client read state is device-local and mode-scoped.
  Backups and teammate/public projections omit both histories and the clear generation.
- A forward change to `sanitize_user_progress_mode_data` is required for new persisted fields.
  Unknown fields are dropped. For history, an omitted old-client field preserves server data.
  A higher full reset epoch discards the losing history. A history-only change is syncable.
  Legacy activity adoption waits for the owning mode to load, retains foreign keys and removes
  source bytes only after adoption.
- Profile progress stays isolated. NULL edition preserves the extra profile's saved edition.
  The primary profile remains accessible irrespective of supporter entitlements.
- See the [client access table](#client-table-access-contract) for explicit grants and the
  [DB runbook](../runbook.md#platform-owned-public-relation-defaults) for platform defaults.

### Client table access contract

All 11 tables below have RLS enabled. `PUBLIC` and `anon` have no table or column grants.
Authenticated reads still obey the existing owner, team-membership, or admin policies. The only
column-only client grant is `api_tokens.UPDATE(note)`. `service_role` keeps SELECT, INSERT, UPDATE
and DELETE on every table; existing RPC/trigger owners keep their access.

| Table                   | Authenticated grants         | Client consumer / server writer                                                                           |
| ----------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `user_progress`         | SELECT                       | Account metadata listener; sync RPCs write progress                                                       |
| `account_ip_audit`      | None                         | Discord/account lifecycle records IP hashes on the server                                                 |
| `user_preferences`      | SELECT, INSERT, UPDATE       | `zz.preferences-sync.client.ts` and `useSupabaseSync` read/upsert; account-deletion Edge Function deletes |
| `api_tokens`            | SELECT, DELETE, UPDATE(note) | `ApiTokens.vue` reads, renames and revokes; token-create Edge Function and gateway manage other fields    |
| `user_prestige_runs`    | SELECT, DELETE               | `useTarkov.ts` reads/deletes history; archive/reset RPC inserts                                           |
| `user_system`           | SELECT                       | `useSystemStore.ts` listener; auth triggers, team/account Edge Functions maintain the row                 |
| `team_events`           | SELECT                       | Team-member reads (RLS); team mutation RPCs/Edge Functions read and create cooldown evidence              |
| `discord_account_links` | SELECT                       | `DiscordLinkCard.vue` reads own link; auth trigger and Discord Edge Functions write                       |
| `team_memberships`      | SELECT                       | `MyTeam.vue`, team store and realtime; team mutation RPCs/Edge Functions write                            |
| `teams`                 | SELECT                       | Team store/listener; team mutation RPCs/Edge Functions write                                              |
| `account_deletion_jobs` | SELECT (admins through RLS)  | Operational admin inspection; account-deletion Edge Function and claim/fencing RPCs write                 |

The grants are enforced by `supabase/migrations/20261007050105_harden_remaining_client_table_access.sql`
and covered by `supabase/tests/database/client_table_access.test.sql`. Table and column access are
checked independently, including inherited/PUBLIC grants and actual owner/outsider operations.
Direct browser maintenance privileges and billing-event access stay revoked. Supporters and
admin audit reads remain RLS-filtered. New `postgres` public tables/views require explicit grants
and RLS where applicable. The [DB runbook](../runbook.md#database-migrations) owns rollout and
catalog readback. Any rollback of deployed grants needs a reviewed forward migration.

## Browser progress authority

`app/stores/tarkov/progressRepository.ts` owns the durable IndexedDB envelope in
`tarkovtracker-active-progress-v1`. `app/stores/tarkov/progressAuthority.ts` fences hydration,
session changes and cache adoption. Captured edits apply to the latest committed envelope and
preserve the owner, original clocks, and reset epochs. Memory adoption and Saved follow
transaction completion. Committed revisions still broadcast if the caller is canceled.
Compare live owner, session generation and revision before adoption. Same-owner tabs share a
generation and failed account intent survives retry.

- Legacy localStorage keys are imported once and preserved. There are no dual writes or fallback
  overwrites. Observed owned edits in older tabs become recovery candidates, never automatic
  imports. No legacy reimport follows reset or device deletion. Older clients retain the existing
  cloud compatibility boundary. Server protocol retirement is separate.
- Keep each distinct snapshot once. Persistent recovery and tab-local failed captures each cap at
  20 copies and 5 Mi UTF-16 characters; the tab limit spans owners. No automatic eviction.
  Only committed copies survive closing a tab. Missed or overwritten edits cannot be recovered.
  `app/shell/OlderTabRecoveryNotice.vue` links to Settings and resurfaces for new copies.
  An overflow warning can outlive cleanup. Read-only export includes the latest uncaptured owned
  bytes even if capturing failed. Debug export does not capture writes and returns null progress
  if authority is unavailable. Diagnostics omit URL queries and fragments.
- Device archives retain current, original and up to 64 older slots, including empty and foreign
  slots, for explicit owner-fenced preview. Reject excess slots before inspecting entries or
  enabling cleanup. After the user confirms the file was saved, clear only the exported owned
  copies. Preserve current/original state, other owners and late-arriving edits.
  See [backup file imports](#backup-file-imports) for worker and transfer boundaries.
- For explicit removal, read and verify owned legacy keys before committing the native recovery
  purge to avoid peer recapture. These stores do not share a transaction. If legacy removal
  fails, skip the final native purge. If native removal then aborts, deleted legacy bytes may
  already be gone while native data remains. Keep unattributable bytes and report incomplete
  removal. An older tab can still write later recovery candidates.
- Database opening has a five-second deadline. A stale late success closes its connection.
  Transient activation uses three fenced attempts, while open timeouts release initial rendering
  after the first deadline. Failed current transitions block progress writes. Superseded failures
  cannot change the replacement session. The bounded cloud startup retry path handles unavailable
  authority.

Run `pnpm run test:progress-app` with `W10_CHROMIUM` and an offline `PROGRESS_APP_URL`
(default localhost:3102) for guest separate-renderer contention, both write/reset orders,
reload, quota/retry and export/preview. Repository tests cover aborts, generations, and
blocked/corrupt/newer storage. Signed-in verification also needs A→B→A, same-owner concurrent
edits, stale activation, and cloud responses crossing a switch. Primitive Web Lock/localStorage
tests cannot prove immediate cross-renderer visibility or substitute for app acceptance.

## Manual player levels

Player levels use each mode's saved `level`, including Seasonal history and prestige archives.
Completing or reversing tasks does not change the level. Users edit it in the drawer or in
Settings → Progression; both editors share `usePlayerLevelEditor`, which rejects blank, fractional,
and out-of-range input (metadata bounds, or the default 1–79 while metadata is absent) instead of
clamping it, and resets an unsaved draft when the active mode or saved level changes. A Tarkov.dev profile import converts the imported XP with player-level metadata once and saves
that level. Imports load missing thresholds before writing progress and fail without changing
progress if thresholds remain unavailable.

The automatic-level preference, XP offset, calculation plugin, and Experience & Level settings
are retired. Hydration and backup imports discard legacy fields while retaining saved levels.
The forward migration drops `user_preferences.use_automatic_level_calculation` and removes
`xpOffset` from the SQL progress sanitizer; it does not rewrite existing progress rows.

Cached clients that still send `xpOffset` cannot change an existing level within the same reset
epoch. Their other progress writes remain supported until refresh; a newer reset epoch still
permits an intentional reset. API level writes discard any inherited offset marker before the
normal merge, so API updates continue to set levels. The existing missing-column retry in
preference sync allows cached clients to save other preferences after the column is dropped.

Existing production JSON offsets were removed by completed one-off maintenance; see the
[runbook](../runbook.md#retired-automatic-level-cleanup). Keep historical migrations immutable.

## Permanent task identity support

The trusted mode-scoped alias ledger in `private.progress_task_id_aliases()` starts empty.
Only `service_role` can read it through `get_progress_task_id_aliases()`. Clients cannot supply
aliases. Under the account/profile locks, canonicalize stored and incoming rows before bounded
merges. Compare original entry clocks, including removals/decreases. Canonical IDs win ties
and unknown clocks. Preserve partial objective fields without copying an unrelated clock.
Reset epochs never merge. Keep unmapped IDs and immutable history intact.

Fresh inserts normalize in a same-transaction update after insertion. Doing so before insertion
would erase alias provenance from `EXCLUDED` during upserts. Validate confirmations before alias
selection, keep originals through comparison, and sanitize the final row even with no aliases.

- `supabase/migrations/20261106155525_reconcile_permanent_task_identities.sql` owns the ledger,
  read RPC and reconciliation. No bulk backfill.
- `supabase/tests/database/task_identity_aliases.test.sql` and
  `scripts/checks/task-identity-concurrency.mjs` verify collision precedence, account/profile/API
  row locks, mode/reset isolation and bounded maps. Replay via `pnpm run supabase:check` on an
  isolated local stack. If an interruption prevents fixture cleanup, reset that isolated database
  before reuse.

Deploy the empty ledger before enabling the Worker flag. Publish and validate the immutable
contracts release, then update Tracker dependency and Worker source pins in a separate consumer
PR. Propagate aliases with tasks-core through live/precomputed readers and every progress,
profile, archive, backup, import and sharing path before reconciliation. Preserve source clocks.
Project pinned/hidden preferences per mode without rewriting the global list. After parity,
activate the Worker and verified aliases with matching catalog IDs and a reviewed forward
migration. Retain activated aliases permanently, refresh caches, verify an old-client write
and fresh read. See the [data and progress roadmap](../roadmap.md#data-and-progress).
