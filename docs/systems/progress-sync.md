# Progress sync and recovery

[CONTEXT.md](../../CONTEXT.md) owns player-facing terms and reliability policy.
[Progress storage](progress-storage.md) owns the database, browser authority and backup format.
This document covers ordering, acknowledgement and recovery across those stores.

## Payload size and rejected saves

`sendProgressSync` compares changes with the acknowledged per-account mode baseline. Unknown
modes remain pending. Split multi-mode wire JSON above 256 KiB, or after a combined size
rejection, into whole-mode requests. Account and profile RPCs cap incoming `p_modes` at
1 MiB of JSONB before sanitization. Never truncate progress or split a single mode into fields.
`supabase/tests/database/progress_payload_boundary.test.sql` covers exact-boundary, one-byte-over,
malformed-container and full-state round trips for both RPCs. The stress mode is 922,374 JSONB bytes.

Cache a size-rejected mode's exact wire snapshot in memory by SDK client/account. Identical
attempts reuse the failure. A changed mode can retry while other modes and metadata can still
save. Recognize the historical size-error message and report `payload_too_large`. Keep changes
pending, stop unchanged auto/manual retries, and offer export. Failed startup retains its
snapshot and coalesces edits into a retry after 30 seconds. A revert to the rejected payload
stays blocked; auth changes and teardown cancel the delay and watcher.

Large requests and rejections can emit `progress_sync_payload` to the opt-in
`NUXT_PUBLIC_PROGRESS_DIAGNOSTIC_SINK_URL`. This setting is separate from general logging and
cleared in previews. The built-in sink needs [edge protection](../runbook.md#optional-environment-variables).
Send aggregate wire sizes, counts, batch modes, result and build only. Exclude raw content,
keys, account IDs, URLs, credentials, errors and referrers. Rejections and other outcomes each
have a 12-second sampling window and 30-sample page budget. Distinguish superseded work from
failure. Telemetry never changes save status. For [#960](https://github.com/tarkovtracker-org/TarkovTracker/issues/960),
record fresh pre/post-release aggregate rejection windows and deployed RPC/app revisions before closure.

## Save status and recovery

### Cloud saves and startup

- `useSupabaseSync` tracks pending versions, saving, scheduled retries and exhausted failure.
  Compare identical transformed payloads in the same owner scope. Remote observations invalidate
  the upload hash. A different pending version survives acknowledgement of an older one.
- A failed write keeps pending work. Subsequent edits wait for reconciliation. Manual retry,
  a new edit after exhaustion and the browser's online event can restart the schedule defined in
  `app/stores/tarkov/progressSaveStatus.ts`. A pause re-arms the retry on resume. The first
  deferred/handoff upload is one direct attempt. A separately acknowledged reset is not re-uploaded.
- Before each retry, wait for the newest authoritative snapshot and merge it with pending
  fields. If reconciliation cannot run or fails, no upload occurs. Error classifications include
  offline, rate limited, auth and unknown. Status and manual retry are controller- and
  session-scoped. Teardown invalidates both.
- Startup must successfully load authoritative REST state before starting saves. Initial failed
  authenticated sync retries at 30-second intervals for up to five attempts. Tear down partial
  controller/listener state before retry. Retry stays in the same session and stops on sign-in
  change or success. Report first failure and exhaustion. If work may be pending and no
  controller exists, the manual retry restarts initialization.
- Capture the user, client, generation and serializer baseline before awaiting cloud work.
  Fence subsequent reads, retry delays, writes, acknowledgements and listener setup on generation
  plus live identity, even across A→B→A. A stale RPC can settle without affecting the replacement
  session. Apply the same fence before dispatching deferred metadata loads. In-flight public
  catalog work keeps its own mode/language/request guard and repairs current progress only.
- Startup retries preserve memory-only edits relative to this tab's original serializer baseline.
  A later shared-slot write cannot become that baseline. A validated unwrapped legacy baseline
  adopts the current owner internally. With no persisted baseline, use unknown or explicit zero
  clocks until edited. If no cloud rows exist and startup does not upload, a handoff controller
  starts with cloned defaults as the acknowledged baseline. Accepting remote changes must not
  consume queued local intent.

### Local persistence and recovery

- Active writes and removals share the exclusive `v2_progress:mutation` lock. Never mutate
  outside it on lock failure. The synchronous Pinia adapter queues work and exposes pending
  edits to same-tab hydration and handoff. Retention and quota pruning use durable bytes.
  Only the latest owned revision can update local status. A write to store state already
  acknowledged in the cloud can fail locally without making that progress memory-only.
- Ordered writes retain their captured owners and before/after baselines. Conditional cloud
  clock acknowledgements recheck the observed value and existence before commit. Divergence,
  session reset or a newer clear fences stale work without reporting a storage failure.
  A matching acknowledgement may update clocks without hiding a different pending intent.
- Compose guest edits and resets against the latest committed envelope under the lock.
  Apply only fields actually edited, including false, null, zero, decreases and deletions.
  Unrelated stale state cannot undo newer changes. Compare the captured hydration bytes or
  zero-clock defaults. Keep uncommitted intent in an ordered per-store prefix through failure,
  cancel, compaction and lock waits. Rebase both sides of remaining captured pairs and their
  memory baseline. Consume only after committing or superseding selected old-epoch edits;
  a reset cannot borrow another source's baseline. Same-time edits advance changed clocks
  beyond the accepted baseline. All-mode reset retains the default envelope with newer epochs.
- Retain a foreign owner's confirmed recovery copy before replacing or clearing active progress,
  including guest hydration. A failed retention blocks destructive writes. Unknown session
  identity leaves owned bytes in place. Malformed bytes require verified ownerless
  quarantine before replacement. Quarantined data is never hydrated, assigned, exported in
  debug diagnostics or automatically pruned. Explicit removal of the same owner follows
  the guarded deletion policy.
- `app/stores/tarkov/accountRecovery.ts` retains one account recovery copy per owner.
  Compose same-epoch copies at sign-in with independent mode/metadata clocks and preserve
  the newer copy's scalar clears. Session handoffs use each mode's clock directly, including
  explicit zero. Retain displaced intent before selecting a higher reset epoch. Stale-season
  placeholders cannot compete with active-season progress. Remove the copy only after cloud
  reconciliation or acknowledgement. A failed read of an existing copy blocks adoption;
  fully denied storage can still run cloud-only when no local copy can be read.
- Preserve pending or memory-only progress before a deliberate reset, including selected-mode
  resets and older Seasonal progress before sanitization. Signed-in clear verifies after
  removal and reports failure when unconfirmed. Superseded copies never merge automatically.
  Settings permits export, discard or owner-confirmed restore with a fresh reset epoch, after
  retaining the target mode's current progress. Reject other-season restore and mutation while
  writes or import confirmation are blocked. Import a valid 16 MiB-or-smaller recovery file
  only for a signed-in owner. Add ID-deduplicated entries to the recovery list without applying
  them. Only explicit discard/removal deletes unrecovered copies.
- Storage pressure can prune only byte-identical redundant backups. Local export does not
  require a successful save. The status indicator prioritizes memory-only changes and never
  recommends clearing site data or reloading as recovery.

### Sign-out and device removal

- `useSignOut` requests confirmation only for memory-only changes. Retry/export keep the
  session open. Only explicit discard lets that sign-out continue. Normal sign-out attempts
  global revocation and discloses uncertainty. Device-only sign-out is a separate explicit
  action when revocation cannot complete.
- `app/utils/supabaseAuthFence.ts` binds SDK reads and removal to the initiating owner. A
  different account's session stops both revocation and clearing. A failed persisted session
  write retains the new value in memory and removes stale persisted state. A later session
  written by another tab takes precedence. Fully blocked reads use the memory fallback.
- Settings → Account removes owned device data separately from cloud deletion. Capture owner
  and removal revision, suppress that owner's handoff, and recheck ownership before each
  cleanup and write barrier. Preserve foreign or unattributable bytes and report incomplete
  cleanup where ownership of malformed active bytes is unknown. Release the active slot only
  after verifying quarantine. See [browser progress authority](progress-storage.md#browser-progress-authority)
  for legacy/native purge order.
- Incomplete removal retains a per-owner, cross-tab retry marker when storage permits. A
  superseded cleanup cannot clear another owner's request, toast for a new session or block
  guest writes after the active slot is clear. The affected owner's sign-in invalidates
  its stale cleanup. Server account deletion uses the same owner guard, with local sign-out
  after server deletion and a device-only fallback as required. Do not redirect until the
  deleted account's session is gone.

### Files

- `app/utils/progressPayload.ts`, `app/utils/progressPayloadDiagnostics.ts` — stable size-error
  classification and opt-in aggregate-only byte/count diagnostics
- `app/stores/tarkov/progressPersistence.ts`, `app/stores/tarkov/startupLoad.ts`,
  `app/stores/tarkov/syncSession.ts`, `app/stores/tarkov/realtimeListener.ts`,
  `app/stores/useTarkov.ts` — load, merge, write, and realtime flow
- `app/stores/tarkov/startupOwnership.ts` — monotonic generation invalidating suspended startup runs
  at session teardowns; `app/composables/useAppInitialization.ts` preserves newer-run lifecycle
  state when a superseded initialization completes or rejects late
- `app/stores/tarkov/progressSaveStatus.ts`, `app/composables/useProgressSaveStatus.ts`,
  `app/shell/ProgressSaveStatusIndicator.vue`, `app/stores/tarkov/progressLiveStatus.ts` — truthful
  local/cloud save status, delayed live updates, bounded cloud retry, manual retry, and export guidance
- `app/stores/tarkov/accountRecovery.ts`, `app/stores/tarkov/supersededProgress.ts`,
  `app/stores/tarkov/storageQuota.ts` — per-account recovery copies, superseded progress (restored only by the owner),
  and redundancy-only storage cleanup
- `app/composables/useSignOut.ts`, `app/shell/SignOutConfirmModal.vue`,
  `app/stores/tarkov/deviceData.ts`, `app/features/settings/DeviceDataCard.vue`,
  `app/utils/supabaseAuthFence.ts` — confirmed sign-out for memory-only changes, owner-fenced and
  device-only sign-out, and explicit device-data removal

### Invariants

#### Merge and acknowledgement

- Merge pending fields against their acknowledged baseline, preserving explicit clears and
  accepting unrelated remote changes, including another mode. Keep `undefined` where it
  represents intent and exclude functions/symbols without converting them into deletions.
  Reconnect waits for in-flight writes and holds new writes until its snapshot is applied
  or the read fails. Writes are serialized with captured values. Acknowledgements advance
  only their changed paths. A newer remote reset invalidates an older acknowledgement; a
  newer local reset stays pending until accepted. Domain merge alone never acknowledges it.
- Entry clocks reconcile counts and clears. Clean player/prestige levels accept newer
  decreases, while pending local edits win until acknowledged. A newer known mode clock can
  accept a deliberate reset to the default level. An unknown-clock placeholder cannot lower
  existing progress using envelope time. Skill-offset maps are atomic during startup.
- Account `updated_at` tracks metadata and compatibility, never supplies mode freshness.
  `progress_updated_at` changes only with sanitized mode progress. Identical writes and
  visibility changes do not advance it. For missing-column errors only, fall back once per
  read and leave freshness unknown. Missing/unmaterialized rows provide no progress.
- With known clocks, startup prefers the newer whole PvP/PvE snapshot. Seasonal uses entry
  merging when its own mode freshness exceeds account metadata, otherwise the preferred
  snapshot. With unknown normalized clocks use timestamped snapshot merging; when both mode
  clocks are unknown, remote scalar values win. Reset epochs take precedence. Profile fields
  retain explicit null/empty values. Keep compatibility account clocks until protocol retirement.
- Locally persist separate metadata/mode clocks and a compatibility envelope timestamp.
  Seed legacy unchanged modes from their original clock, with unknown history at zero.
  Hydration keeps source clocks. A merge retaining local fields advances beyond the incoming
  mode clock so a reload cannot lose pending changes to a tie. A matching acknowledgement can
  persist clocks without a Pinia patch only while observed data and clocks still match. Track self-origin around
  actual RPC writes, clear it on failure, and invalidate it on session reset.

#### Realtime and fallback

- Detached system/team scopes own channels and remove them through the client that created
  them. Await a clean leave before rejoining a topic. A different topic can proceed.
  Publish channel ownership and subscribe in one synchronous step. Reject stale setup,
  callback or teardown work at each asynchronous boundary. Sign-out removes all channels.
- Register the REST reader during setup without waiting for a join. A transport failure
  leaves the loaded save controller intact. Delayed/failed join becomes a separate live
  warning after 15 seconds, behind unsaved work. Foreground online fallback polls at
  30–45 seconds using a single-flight read and 15-second snapshot deadline. Join/rejoin
  requests a fresh snapshot, even when an older read is pending. Clear the warning only
  after the catch-up succeeds. Pause when hidden/offline, refresh on return and cancel on teardown.
- After 60 seconds hidden, the shared transport disconnects without removing its channels.
  Wait for the pending disconnect and access token when visible. Gate new subscriptions on
  that token. Retry a thrown session read/connect once. The SDK owns socket retry; auth,
  connectivity or a later connect attempt can also resume it. REST and saves can proceed
  independently of the socket.
- Team reconnect refreshes membership before changed filters and teammate hydration. Only
  the winning membership refresh can hydrate, after the replacement joins. Failed reads
  retain previous teammate progress. Leaving or disposing clears the hydration request.
  Owner/teammate snapshots ignore unmaterialized rows. Treat SDK callbacks as payload-only.
- Supporter status refreshes after first join and rejoin. Initial callers share the latest
  result, with fallback when subscription declines or join fails. Mark loaded after a
  successful read, release waiters on session reset, and retry failures on the existing channel.
