# Progress sync and recovery

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Save status and recovery

The reliability policy and vocabulary live in `CONTEXT.md`. Local persistence and cloud
acknowledgement are separate facts, tracked in `app/stores/tarkov/progressSaveStatus.ts` and
shown by `app/shell/ProgressSaveStatusIndicator.vue` in the app bar.

- **Unchanged saves.** The sync controller deduplicates only identical serialized payloads after
  the production transform and owner assignment. External acknowledgements use the same comparison;
  a different pending payload stays pending. Remote observations invalidate the saved baseline.
- **Cloud status.** `useSupabaseSync` reports `pending` from the first local change until the
  service acknowledges the latest version, `saving` while a write is in flight, `retry_scheduled`
  after a failure, and `failed` once the bounded schedule (`CLOUD_SAVE_RETRY_DELAYS_MS` in
  `app/stores/tarkov/progressSaveStatus.ts`) is exhausted. Exhaustion keeps the changes pending. After a failed write, edits
  never upload directly: they wait for the scheduled retry, and an edit after exhaustion restarts
  the schedule, as a manual retry (`retryCloudSave`) or the browser `online` event does. A retry
  that could not upload during a pause is re-armed on resume, and edits made during the upload that
  recovers from a failure get their own reconciled retry. The first upload of a deferred or handed-off sync start is
  one direct attempt; its retries are the controller's reconciled ones. A reset saved by its own RPC
  is acknowledged to the controller, so it is neither reported pending nor uploaded again. Every retry first reads the remote snapshot and merges it into the pending changes,
  as a Realtime reconnect does, so changes saved on another device are not overwritten by a stale
  upload; a retry that overlaps a reconnect waits for the newer snapshot. If no snapshot can be
  merged (no listener is running, the read fails, the socket is suspended, or the account changed), the retry counts as a
  failed attempt and uploads nothing. Failures
  are classified as `offline`, `rate_limited`, `auth`, or `unknown` so the
  indicator can distinguish a known cause from an unknown one. If the initial authenticated sync
  fails, no controller runs, so `useAppInitialization` marks cloud saving `failed` when local
  progress may be waiting (tracked progress, a failed local save, or a recovery copy that exists,
  cannot be read, or is blocked; otherwise it is only a load failure), and its manual retry restarts initialization; a successful startup load clears that status. It also acknowledges
  memory-only local changes when the cloud now holds them (a cloud record was reconciled or local
  progress was migrated); otherwise sync starts and uploads them. Before any
  initialization retry, memory-only edits are handed to the startup merge as the session snapshot
  (`preserveUnsavedSessionProgress`), so rehydrating from storage cannot discard them. Only the
  edited modes and metadata get new clocks, so untouched modes still yield to newer remote progress.
  Startup captures this tab's serializer baseline before awaiting cloud reads; failed initialization
  retains it for the same account. Retrying compares memory-only edits with that baseline rather than
  treating another tab's newer envelope as the source of this tab's stale values. Session transitions
  still clear the baseline. If no owned persisted baseline exists, this tab retains its current
  state under that account with unknown (zero) clocks. Only subsequent edits advance them; a later
  shared-storage write cannot become this tab's comparison baseline. An accepted unwrapped legacy
  baseline is scoped internally to the current account after local ownership checks, so later
  serialization does not reload shared storage because its old wrapper lacked an owner.
  When composing copies, session handoffs use each mode's clock directly, including zero, instead
  of borrowing another mode's edit time from the envelope. Other copies with unknown mode clocks
  keep the existing write-time fallback. An untouched default mode with an explicit zero clock
  also keeps zero authority, even when metadata has a newer edit clock. The handoff marker is in
  memory only, not a persisted field.
- **Local status.** The progress persist plugin writes through `progressPersistStorage`, because
  `pinia-plugin-persistedstate` swallows storage exceptions. Store and sync writes of the active
  progress key, including sign-out restoration, go through `persistActiveProgressValue`. It records
  `pending` while queued, then `saved` or `failed` (`quota`, `unavailable`, `unknown`). A failed local write means the latest changes are memory-only, except a write of
  remote state and clocks the cloud already holds, which reports `failed` without marking progress
  unsaved.
  All active-key writes and removals share one exclusive Web Lock (`v2_progress:mutation`), held
  across the durable read, ownership/retention checks, and mutation. Missing or rejected locking
  reports failure without an unlocked fallback. The synchronous Pinia adapter queues writes and
  offers pending edits for same-tab hydration, startup, and handoff; retention and quota pruning
  read durable storage. Ordered pending writes, including accepted cloud clocks, transfer with
  their captured baselines across auth changes. An acknowledgement can expose its clocks for
  unchanged progress but cannot hide a different queued edit or clear its failed-save warning.
  Restoration also checks its captured baseline under the lock. The store's memory-only session
  reset suppresses both serialization and adapter writes and seeds a zero-clock serializer baseline,
  so reset placeholders never acquire progress clocks or replace genuine pending edits. Only the
  latest queued edit updates local save status. Session changes, write
  barriers, and resets invalidate earlier queued writes; cleanup for an old owner does not cancel
  another owner's edits. Remote clock acknowledgements compare their observed baseline again under
  the lock, including whether the slot existed, so a later write or clear wins. Conditional
  acknowledgements share the ordered pending registry so successive accepted clocks persist
  in order. Their clocks are available to hydration and handoff when progress is unchanged,
  while different pending edits and their save status remain visible. A superseded
  acknowledgement is canceled without reporting a storage failure. Pending memory-only
  progress participates in sign-out protection and prompts before reload; a cloud-held acknowledgement
  alone does not create that loss warning. Tabs running older cached code do not participate in the
  lock until they reload.
  If active bytes parse as neither a scoped envelope nor legacy progress, replacement first saves
  and reads back the exact bytes under an ownerless quarantine key. Quarantined bytes are never
  hydrated, assigned to an account, included in debug exports, or pruned as backups; if preservation
  fails, replacement is rejected and the active value remains untouched.
- **Indicator.** Memory-only changes outrank cloud warnings. Warnings offer an export of the
  current in-memory progress (`useDataBackup().exportProgress`), which needs no successful save;
  cloud warnings also offer a manual retry. Guidance never recommends reloading or clearing site
  data as a fix.
- **Account recovery copies.** `app/stores/tarkov/accountRecovery.ts` keeps at most one copy per
  owner under `v2_progress_recovery_<userId>`. The active-progress retention guard saves the
  previous owner's copy before any guest or other-account state replaces it, so a session
  transition keeps it whether or not the sync controller still reports pending changes. Sign-in retains any other account's active copy before it is
  cleared, including the hydration-time owner mismatch that previously created throwaway
  `progress_backup_*` keys. Hydration before the session is known leaves an owned copy in place
  rather than treating it as another account's. At sign-in recovery, active storage, and session
  handoff copies are composed using independent metadata and mode clocks before the normal startup
  merge. Copies of a mode at the same reset epoch are merged, so edits held by only one of them
  survive; the newer copy's single-value fields (including deletions) win, as in the startup merge. Higher reset epochs take precedence
  only after displaced progress is retained for export. Old-season placeholders cannot compete
  with current Seasonal progress. The recovery copy is removed only once the cloud
  holds the resolved state: after a startup load that reconciled a cloud record or migrated local
  progress, or else once an upload of the recovered state is acknowledged (the first attempt or a
  scheduled retry). Copies are read only for their owner and never uploaded for another account. A failed
  read of an existing copy blocks sign-in, but a browser that refuses all storage access holds no
  copy to protect, so cloud-only sync still starts there.
- **Superseded copies.** Before a deliberate reset with pending cloud changes or memory-only local changes, the store keeps each
  affected mode that differs from its defaults under an owner-scoped export-only key. A remote
  reset delivered over Realtime while local changes await acknowledgement does the same before it
  replaces the mode. If that copy cannot be saved, the reset is not applied, active writes stay
  blocked, and sync stays paused for the session so the displaced edits cannot overwrite the reset;
  the next startup load retries the retention. A deliberate signed-in reset clears the owner's active copy
  without creating an account recovery copy of the pre-reset progress. A signed-in Settings reset reports
  completion only once the clear confirms that no active copy remains for a reload to restore;
  otherwise (for example without cross-tab locking, or when a session change cancels the clear) it
  reports failure. Removal is verified by reading the slot after deletion; failure status is fenced
  by the local write revision so an older clear cannot replace a newer pending save.
  The online profile reset logs such a failure for its still-current session.
  Delayed signed-in reset responses are fenced by session generation and owner identity before
  applying local state, acknowledging the save, or clearing active storage, including A→B→A switches.
  Guest Settings resets instead atomically replace the guest envelope under the shared Web Lock,
  preserving unrelated modes and their clocks. All-mode resets retain a default envelope with
  increased reset epochs. Ordinary guest writes reconcile the entire envelope under the same lock,
  so a stale tab cannot restore an older reset epoch or overwrite newer unrelated modes. Memory
  and serializer clocks adopt committed guest writes without stamping imported fields as edits.
  Guest intent baselines use the captured hydration bytes or initial defaults with zero clocks,
  rather than a subsequently changed shared slot. Captured guest sources keep queued intent bound
  to its original tab/store; already serialized
  old-epoch edits remain fenced, while uncaptured later live changes are persisted separately
  before local status becomes saved. Changed guest clocks advance beyond their accepted baseline,
  including when consecutive edits share a timestamp or another tab has a future clock; unchanged clocks remain exact.
  Captured same-epoch changes, including decreases and removals, apply only their edited fields
  to the durable snapshot; unproven raw copies remain conservatively merged. Raw envelopes retain
  their original bytes when reconciliation changes
  no state or clocks. Failed
  reads, writes, retention checks, session fences, or unavailable locks reject before memory changes.
  These guarantees require the current client; an older cached client that writes raw envelopes
  does not participate in this reconciliation. Fully blocked storage holds no copy. Hydration also retains non-default Seasonal
  progress stamped for an older season before sanitization clears it. These copies keep their
  original mode and season, are available from Settings → Account for export, and are never loaded
  into the tracker or sent to Supabase. They are removed only with that account's explicit device-data
  removal.
- **Storage pressure.** `relieveProgressStoragePressure` removes only legacy backups that are
  byte-identical to the active copy, a recovery copy, or a newer backup. Session transitions and
  deliberate resets do not delete account recovery copies or unique legacy backups automatically.
- **Sign-out.** Every sign-out entry point uses `useSignOut`. It signs out immediately unless the
  changes are memory-only (local save failed and cloud changes pending); then
  `SignOutConfirmModal` explains the loss risk and defaults to staying signed in. Retry and
  export never sign out; only the explicit discard action does. Normal sign-out attempts global
  revocation. When the server cannot be reached but Supabase still clears this browser's session,
  the player is told that other sessions may remain signed in. When the session cannot be ended at
  all (for example an expired token while offline), the failure toast offers an explicit
  "Sign out on this device only" action (`signOutThisDevice`), which removes only this browser's
  copy of the owner's session and discloses that the server session stays active. Account deletion
  uses local scope only after the server has deleted the account.
- **Auth owner fence.** The Supabase client stores its session through
  `app/utils/supabaseAuthFence.ts` under the SDK's default key. While a sign-out is fenced to an
  owner, the SDK's own session read and removal throw `SupabaseSessionChangedError` if another
  account's session is stored, so a session written by another tab mid-sign-out is never revoked
  or cleared. Any server revocation uses the token read inside the fence. Browser storage stays the
  session store whenever it can be accessed: if a write fails (for example a full quota), the new
  session is held in memory and the stale persisted session is removed, so a readable session is
  never hidden behind an empty memory store. A session another tab persists later replaces
  that memory copy, so the owner fence still sees it and the memory copy cannot resurface. Memory-only storage is used only when
  reads are blocked.
- **Removing device data.** `DeviceDataCard` (Settings → Account) is the explicit action,
  distinct from sign-out and from cloud deletion. It registers `requestDeviceDataRemoval` before
  signing out so the progress and preferences session transitions retain no copy for that owner,
  then `removeAccountDeviceData` deletes the owner's active copies, recovery copy, preferences,
  activity-log envelopes, and legacy backups. Each shared key's ownership is re-read immediately
  before removal, so a value another tab stores for a different account is kept. A well-formed value with no
  owner envelope cannot be attributed and is likewise kept without marking removal incomplete;
  malformed active bytes instead follow the quarantine flow below. Other accounts' data and cloud progress are untouched; the next sign-in clears the
  request. Removal and discard confirmations belong to the authenticated owner that opened them
  and capture a removal-request revision. Every cleanup continuation rechecks that revision and
  the live session before deleting more copies or installing a write barrier. A superseded cleanup
  cannot clear a newer request; signing back into the removed account also suppresses stale retry
  markers and result toasts. Switching to another account keeps an unfinished cleanup retry scoped
  to the removed owner.
  Confirmations are invalidated when that owner changes. Incomplete backup cleanup reports failure but blocks
  new guest writes only while the removed owner still occupies active storage. Account deletion uses
  the same removal for the captured deleted account and checks identity before sign-out and reset;
  both sign out through the auth owner fence. If sign-out succeeded but cleanup was incomplete, the
  card keeps a retry bound to the removed owner until it succeeds or that owner signs in again.
  Each such owner gets its own stored marker when storage accepts the write, and stays incomplete
  until that marker is deleted, so the retry survives a reload, covers owners recorded by other tabs, and no tab overwrites another's marker; account deletion records incomplete
  cleanup the same way.
  If the server cannot be reached, the confirmation offers the disclosed device-only sign-out.
  A removal that throws is reported as incomplete, and the card's superseded-copy list follows
  changes made in other tabs. After account deletion, a failed local sign-out falls back to the
  device-only sign-out; the card does not redirect while the deleted account's session remains.
  Malformed active bytes that name the removing owner are deleted. Bytes with no provable owner are
  quarantined, and the active key is released only after a quarantine-prefixed marker is saved;
  that marker keeps the owner's later removals incomplete while the quarantined copy exists. If quarantine cannot be
  verified, removal fails and the active write barrier stays in place.

### Files

- `app/stores/tarkov/progressPersistence.ts`, `app/stores/tarkov/startupLoad.ts`,
  `app/stores/tarkov/syncSession.ts`, `app/stores/tarkov/realtimeListener.ts`,
  `app/stores/useTarkov.ts` — load, merge, write, and realtime flow
- `app/stores/tarkov/startupOwnership.ts` — monotonic generation invalidating suspended startup runs
  at session teardowns; `app/composables/useAppInitialization.ts` preserves newer-run lifecycle
  state when a superseded initialization completes or rejects late
- `app/stores/tarkov/progressSaveStatus.ts`, `app/composables/useProgressSaveStatus.ts`,
  `app/shell/ProgressSaveStatusIndicator.vue` — truthful local/cloud save status, bounded cloud
  retry, manual retry, and export guidance
- `app/stores/tarkov/accountRecovery.ts`, `app/stores/tarkov/supersededProgress.ts`,
  `app/stores/tarkov/storageQuota.ts` — per-account recovery copies, export-only superseded progress,
  and redundancy-only storage cleanup
- `app/composables/useSignOut.ts`, `app/shell/SignOutConfirmModal.vue`,
  `app/stores/tarkov/deviceData.ts`, `app/features/settings/DeviceDataCard.vue`,
  `app/utils/supabaseAuthFence.ts` — confirmed sign-out for memory-only changes, owner-fenced and
  device-only sign-out, and explicit device-data removal

### Invariants

- The UI may call progress locally saved only after `persistActiveProgressValue` confirms the
  write. A cloud failure is never evidence of a local save, and exhausting cloud retries never
  clears the pending state or discards the changes.
- Active progress replacement and removal must check the latest persisted envelope owner and
  confirm retention of a foreign owner's recovery copy first. This guard also covers guest
  hydration after a reload, when no in-memory transition barrier exists; failed retention blocks
  writes and removal while resetting visible session state. Explicit removal of that same owner's
  device data is the only bypass.
- Cloud save status and the manual retry handler belong to the current sync controller; a
  session reset clears both, and a disposed controller cannot publish status for the next session.
- An account recovery copy is restored or synchronized only while its owner is signed in, and
  automatic cleanup never removes a recovery copy or a legacy backup with unique content.
- Sign-out never requires cloud connectivity: an unconfirmed revocation is disclosed, and a
  device-only sign-out is always an explicit choice. Memory-only changes are discarded only after
  the player explicitly confirms the discard action.
- Sign-out never revokes or clears a session stored for an account other than the one it was
  started for; the auth storage fence enforces this inside the Supabase SDK.
- Authenticated progress startup captures a generation, user ID, and client before its first await.
  `resetTarkovSync` and newer initializations invalidate ownership synchronously. Both generation
  and live identity are checked before resuming account-scoped effects after reads, retry delays,
  merge/migration/repair writes, and before starting sync or listener setup. The freshness-column
  compatibility fallback checks ownership before dispatching its second query. Identity alone is
  insufficient for A→B→A transitions. Queries and broadcasts use the captured user ID. An RPC
  already dispatched may settle, but stale acknowledgements cannot patch progress, advance its
  persistence baseline, or install/replace sync machinery. Superseded initialization failures do
  not report a current-session load failure or clear the newer app-initialization lifecycle state.
  Deferred metadata work checks ownership before dispatching initialization and its follow-up
  refresh; already-dispatched public-catalog requests retain metadata's mode/language/request
  guards. Their catalog repair hooks intentionally apply to the currently loaded progress, not to
  a captured account snapshot.
- System and team singleton listeners own detached effect scopes and stop those scopes during explicit
  cleanup, so their channel lifetime is independent of the route that first created them.
- Every channel is stored with the client that created it and removed through that client, because
  `$supabase.client` starts as an offline stub and is replaced once background initialization
  completes. Team subscription callbacks also check suspension on that owning client’s transport,
  so replacing the current client cannot hide failures or tear down a deliberately suspended channel.
  Removal is awaited before the same topic is rejoined: `RealtimeClient.channel()` returns
  the existing channel until its `phx_leave` settles and `subscribe()` only rejoins a closed channel,
  so rejoining early yields a channel that never joins and never reports an error. An unclean leave
  skips the rejoin rather than binding to an occupied topic.
- Own-progress listener setup waits for the initial `SUBSCRIBED` acknowledgement, rejects on an
  explicit channel failure, and times out a join that reports no status. A newer setup or teardown
  invalidates older work at each asynchronous boundary and rejects progress and metadata callbacks
  from the superseded listener, including while its channel is leaving. A different user's topic may
  proceed while the previous user's topic is leaving, while a same-topic rejoin still waits for its leave.
  Publishing channel ownership and starting the subscription share one synchronous segment: an
  asynchronous boundary between them would let a teardown remove the published channel before it
  joined, and the resulting subscription could no longer be attributed to this setup for cleanup.
- `user_system` is included in `supabase_realtime`, and sign-out tears down all client channels.
- The shared browser Realtime transport disconnects after 60 seconds continuously hidden. Channel
  ownership is retained, new connect attempts are gated while suspended, and a visible tab waits for
  an outstanding disconnect before reconnecting once. Auth, local persistence, and outbound saves
  remain active. Rejoined consumers refresh authoritative snapshots; owner progress uses existing
  merge/epoch rules, and snapshot responses cannot overwrite newer live events or another session.
  Pending snapshots omit non-serializable fields, including functions and symbols, while retaining
  explicit `undefined` fields. Removing transient state must not become a persisted field deletion.
  A three-way merge compares each field with its acknowledged baseline, retaining only locally
  changed paths while accepting unrelated remote changes, including changes in other modes.
  Player level is an editable scalar: accepted live/reconnect rows can lower a clean local level,
  while a pending local level edit wins until acknowledged. Startup takes the level from the
  preferred mode snapshot, so a newer decrease is not replaced by an older maximum.
  Recovery composition also honors a known newer mode clock's level; an unknown-clock
  placeholder cannot lower existing progress using only its envelope write time. Owned snapshots
  with known mode clocks still reconcile a deliberate level decrease to the default level.
  Live mode rows and startup snapshots resolve counts by entry timestamp rather than maximum,
  so an acknowledged count clear is not resurrected. Pending fields (including explicit clears) survive reconnect reads, incoming live events,
  and edits made during those reads; a higher reset epoch still wins over an older epoch's edits.
- Progress RPC upserts compare sanitized account/mode values before updating. Identical saves do not
  change progress timestamps or emit progress-row events. The legacy compatibility trigger remains;
  its normalized write makes the subsequent identical RPC upsert a no-op. Startup account metadata
  uses the account timestamp; each mode independently uses `progress_updated_at`, which changes only
  with sanitized progress. Visibility-only writes never advance it. Historical rows retain null until
  progress changes; unknown normalized mode freshness stays unknown instead of borrowing metadata
  freshness. Known local mode clocks preserve offline scalar edits while entry timestamps and reset
  epochs still reconcile progress. With both mode clocks unknown, remote scalar fields win;
  progress scores from unrelated modes cannot choose them. Database legacy mode payloads are no longer read; missing normalized modes never borrow
  the account metadata clock.
  During the additive freshness-column rollout, startup and reconnect reads retry once without
  `progress_updated_at` only when PostgreSQL/PostgREST reports that column missing. Those rows
  retain unknown mode freshness; account timestamps never substitute for it. Other errors and
  failed fallback reads remain failures. Each read probes the column again so completed migrations
  take effect without a reload.
  Startup selects the merge policy independently for each mode. Known-clock PvP/PvE progress
  takes the preferred snapshot, so stale trader, reputation, or skill maxima cannot replace
  newer decreases. Seasonal merges progress by entry timestamps when its own normalized
  progress clock exceeds account metadata, regardless of PvP/PvE or aggregate clocks; otherwise
  it takes the preferred snapshot. Unknown normalized mode clocks retain timestamped snapshot
  merging in every mode. Higher reset epochs always win before either policy. Profile fields
  use the preferred snapshot verbatim, including null names and empty offsets; Seasonal's
  existing trader and skill maximum behavior during snapshot merging is unchanged.
  This client policy does not protect older cached clients: phase 3 must retain server
  compatibility account-clock updates until protocol retirement is enforced. Elapsed deployment
  time alone cannot prove that those clients are retired.
  Startup skill-offset maps are atomic: absent keys represent deletions, and historical snapshots
  have no per-offset timestamps or deletion markers to safely union concurrent edits.
  Local envelopes retain `_timestamp` for envelope compatibility and add `_metadataTimestamp` for
  account settings plus independent `_modeTimestamps` for progress. Only changes
  within a mode advance its local clock; account hydration keeps the server metadata clock, and switching modes or editing another mode does not. Legacy
  envelopes seed unchanged modes from their original timestamp (unknown history stays zero).
  Startup and Realtime hydration retain remote progress freshness, rather than download time.
  Accepted envelopes are persisted even when a matching acknowledgement needs no Pinia patch,
  provided shared storage still matches the tab's prior data and clocks. Divergence skips that
  acknowledgement write so another tab's unsaved edits remain stored;
  merged snapshots that retain local fields use at least one millisecond beyond the incoming
  snapshot clock, so reload cannot discard pending edits on a timestamp tie. Each tab compares
  with its own prior snapshot so another tab's storage write cannot make stale fields look edited.
  Visibility changes update `updated_at`, never `progress_updated_at`, and cannot justify replacing whole mode snapshots.
  Team rejoin refreshes membership and rebuilds changed filters before hydrating teammates; initial
  joins do not trigger an additional hydration. Replacement of a previously joined channel after
  connection failure also hydrates after successful membership refresh and the replacement join.
  Only the winning membership refresh may trigger
  hydration after a successful membership read; a failed read neither hydrates nor rebuilds.
  Pending hydration follows the winning replacement team when a team switch retains teammate
  stores during reconnect; it fires only after the replacement joins. Leaving all teams or disposing
  the controller clears that intent.
  A superseded reconnect request cannot race ahead of a newer filter rebuild. Optional missing account metadata never blocks
  normalized reconnect progress. Normalized reads retain startup retries and API error mapping.
  Unmaterialized normalized rows are absent for startup progress and freshness. Outbound writes are
  serialized with captured payloads and versions; resumed saves cannot overtake an in-flight save.
  Save acknowledgements advance only their changed paths, preserving unrelated remote values
  accepted while the save was queued or in flight. Pending captures track intervening accepted remote
  changes separately from local acknowledgements, so older live events cannot override newer snapshots.
  Domain merges do not acknowledge unsaved local fields. A newer remote reset invalidates older
  save acknowledgements for that mode; a newer local reset stays pending until its save succeeds.
  Owner and teammate reconnect/live mode hydration ignore unmaterialized placeholder rows.
  Teammates retain previously hydrated progress if the normalized snapshot read fails.
  Realtime SDK callbacks forward only their payload to reconciliation handlers; transport message
  references must never be interpreted as snapshot reconciliation functions.
  Reconnect reads wait for in-flight saves and hold new outbound writes until snapshot application
  completes. Local changes remain tracked and are saved afterward; read failures also release this barrier.
  Supporter status refreshes after the first join as well as subsequent joins to close the
  initial read/join gap. An owner or generic subscription whose first join is delayed by suspension reconciles on its first
  eventual join. Initialization delegates the initial status read to the subscription, with a
  fallback status read if the subscription declines or the initial join fails. Initialization marks status loaded only after a
  successful read; initial callers share the latest request's result even when a refresh supersedes
  the initial query. Session reset releases waiters, and failed reads can retry on the existing channel.
  Skipped saves do not run payload transforms. Actual RPC writes temporarily mark the self-origin
  timeline before awaiting the response; failure removes that marker, success retains it, and
  session reset invalidates outstanding markers.
