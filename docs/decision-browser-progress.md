# Browser progress authority checkpoint

W10 requires a transaction-backed browser progress record because a native Web Lock does not
make another renderer's localStorage cache current. This checkpoint proposes a staged replacement
and records the remaining rollout decision. The application still uses its existing storage paths;
`progressRepository.ts` is an inactive substrate with no runtime callers. Issue #1091's preserved
reset implementation remains separate, and draft #1086 must retain its cached-client hold.

## Verified source and native boundary evidence

Source audit base: main `abb4e9b1a8abb9fa0f8807a909d009926db8c236` on 2026-10-06. Root
`AGENTS.md` and `supabase/AGENTS.md` apply; no `.agents` directory exists at this revision. Open
PRs were #1086, #715 and #517. Issues #1091 and #1092 remain open. #1091's owner work is preserved
in another environment at `/home/lab/.worktrees/tt-guest-reset-proof`; it is not present in this
Windows clone and must be transferred with its staged and unstaged deltas before reuse.

`scripts/checks/progress-renderer-repro.mjs` starts an isolated Chromium profile and loopback
server. It uses unmodified native storage getters, setters, locks, and transactions. It does not
load the application, emulate its merge rules, or contact production services. Each receipt
records the script SHA-256 and native trace marks linking actors to separate renderer PIDs.

On Chrome 154.0.8037.97, the final run made 50 immediate write/release attempts in each
order. Six of 100 trials lost a preceding PvE 55 write: the next native lock callback read PvE
42 and persisted it during a PvP reset. Fresh renderers read the failing result as 1/42/33 in
the failing cases. Actor A and B trace PIDs were 35280 and 41500. Both controls that held the writer's
lock until the resetter received the exact 55 storage event preserved 55. No timer delays prove
visibility. The initial process-start poll is only a browser startup mechanism.

Eight IndexedDB control outcomes cover both actor orders, first save and existing save, plus
abort retaining the previous record. These are primitive controls, not application Saved,
recovery, crash, or quota acceptance evidence. The timing-sensitive race need not fail on every
run. A passing run cannot establish a localStorage visibility guarantee.

The final source-matched run added actual inactive-repository controls. Those pass in both
separate-renderer orders: stale revision rejection, selected reset preserving PvE 55,
put-request success followed by transaction abort with no acknowledgement/baseline advance,
and deletion/reopen preventing reimport. An earlier 100-trial repeat happened to preserve 55;
that positive repeat does not supersede the failing traces or establish cache freshness.
Receipts distinguish primitive boundary reproduction from actual repository controls and
include separate script/repository source hashes.

Run the native probe with `W10_CHROMIUM` set to a locally installed Chromium executable and
`pnpm run test:progress-native`. `W10_ROUNDS` sets 1–1000 trials per order (default 50);
`W10_RECEIPT` chooses the full JSON receipt path. The browser profile and trace are local
artifacts. [The compact native receipt](./evidence/w10-native-repository.json) records the
reviewed outcomes; the script deliberately does not require a timing-sensitive loss to occur.

## Writer and reader inventory

| Surface                                                | Current source                                                                                            | Required integration boundary                                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary progress edits and catalog repairs            | `progressState.ts`, `useTarkov.ts`, `progressStorePersist.ts`                                             | Capture immutable edit intent against the accepted baseline; queue commit; adopt accepted epochs without turning rereads into fresh edits.                       |
| Synchronous Pinia hydration and serialization          | `progressStorePersist.ts`, `localStorage.ts`                                                              | Gate edit and cloud startup on asynchronous authoritative hydration. Do not call old synchronous hydration authoritative.                                        |
| Active edit and handoff writes                         | `persistActiveProgressValue`, `progressPersistStorage`                                                    | Replace latest-record reads, retention, write, and acknowledgement as one transaction boundary.                                                                  |
| Accepted remote clocks                                 | `createProgressStorageSerializer.acceptRemote`, `startupLoad.ts`, `realtimeListener.ts`, `syncSession.ts` | Preserve compare-and-swap semantics; rejected or aborted ACKs cannot advance the accepted durable baseline.                                                      |
| Guest selected and all-mode reset                      | `resetEngine.ts`                                                                                          | Read current authoritative state, reset only selected modes, advance their epochs, retain all-mode epoch fences, patch memory after commit.                      |
| Online reset and prestige                              | `useTarkov.ts`, `progressPersistence.ts`                                                                  | Network stays outside IDB. Preserve remote success versus local failure reporting, PvP/PvE archives and Seasonal prestige exclusion.                             |
| Sign-in, sign-out and same-account restart             | `useTarkov.ts`, `syncSession.ts`                                                                          | Transfer pending baseline chains; check owner and generation in the committing transaction and again before applying results.                                    |
| Startup guest, owned, recovery and remote adoption     | `startupLoad.ts`                                                                                          | Read authority before reconciliation; preserve original season/owner/bytes before sanitation; cloud starts only after ownership and local commit settle.         |
| Foreign-copy retention and recovery                    | `accountRecovery.ts`, `supersededProgress.ts`, `realtimeListener.ts`                                      | Active displacement and retention cannot read separate stale localStorage caches; new authority must retain displaced data atomically.                           |
| Checked deletion, opaque quarantine and device removal | `localStorage.ts`, `deviceData.ts`, `clientStorage.ts`                                                    | Keep exact-byte checks, incomplete-removal markers and durable owner deletion tombstones. Never resurrect removed bytes through migration.                       |
| Backup import, user export and debug export            | `useDataBackup.ts`                                                                                        | Import mode targeting and metadata remain explicit; export new-only state and recovery bytes before rollback. Pending import completion must await local commit. |
| Startup storage version cleanup and quota relief       | `00.storage-version.client.ts`, `storageQuota.ts`                                                         | No version bump deleting legacy/recovery evidence; preserve unique recovery, quarantine and superseded copies under pressure.                                    |

Account recovery keys and superseded copies currently use synchronous localStorage helpers.
Changing only the active adapter would leave these retention reads and writes outside the new
authority. Their eventual integration needs one transaction scope for active displacement,
retained owner records and required archives. Unrelated preferences and auth credentials are
outside W10's storage replacement.

## Authoritative commit contract

The [decoder-stage native receipt](./evidence/w10-native-decoder.json) reruns the updated module
controls in separate renderer processes and passes both orders. Its bounded 20 race trials had
one localStorage loss; the earlier six-loss receipt provides positive evidence in both orders.
The race is timing-sensitive, not a deterministic claim. Focused decoder tests cover rejection with unchanged originals,
missing optionals and competing queued revision-CAS writes. Trial counts outside 1–1000 are
rejected before browser launch.

The inactive substrate stores session control and owner-scoped progress in one object store.
Native readwrite transactions serialize the session check, latest-record read, revision check
and replacement. A transaction result resolves only on `complete`, never on put-request
success. `abort`, quota and unavailable errors leave revision/state unchanged and propagate to
the caller. A strict durability hint is requested; transaction completion is not an unconditional
promise of survival after device failure or power loss. Site-data eviction remains possible.
See [IndexedDB transaction scheduling](https://w3c.github.io/IndexedDB/#transaction-scheduling)
and [Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html).

The substrate intentionally uses whole-record revision CAS instead of speculative merge logic.
Concurrent stale envelopes return a conflict. An integrating caller must reread and reconstruct
its original intent against accepted state before retrying; it cannot blindly retry the same
whole envelope or report Saved. Revision ordering preserves sequential scalar decreases and
does not rely on distinct wall-clock milliseconds. Epoch metadata comes from the committed
state. Ordinary edits cannot change epochs; selected reset increments only selected epochs and
preserves unrelated modes. First import accepts validated source epochs once. Deletion retains
an epoch tombstone with no progress payload and forbids automatic import.

Every stored session and owner record is decoded inside its transaction before use. Logical
version, structural shape, owner-key identity, safe counters and mode/state epoch consistency
are checked centrally. Unknown versions or corrupt records return `ProgressRepositoryDataError`
without resetting, migrating, falling back, overwriting or deleting their original keys. Cursor
reads distinguish an absent key from a present null/undefined value. Activation also validates
the destination owner before changing the session. Outgoing records use the same validation.
Session records explicitly carry logical version 1; the earlier inactive prototype's unversioned
sessions are rejected rather than silently upgraded. Opaque additional fields and exact legacy
strings are retained. A typed check table covers every current `UserProgressData` field, validates
known map/history entries and present optionals, and allows missing optionals without defaulting.
Malformed known fields are rejected even when opaque extensions are retained. Revision zero is
empty-only. Dictionaries must be plain records; Map/Date values are rejected and retained.
Existing coercive sanitizers are unsuitable for this retain-and-reject boundary.
Recovery/export UI remains an integration gate. Conflict retry must never just increment `expectedRevision` on a stale
envelope: reread accepted state and reapply the original intent.

An owner token includes a persisted generation. A transition A to B to A invalidates old A
operations even though the account ID matches again. Joining an already-active owner can reuse
its generation; deliberate same-account restart renews it. These are internal persistence
fences, not an authorization system. A pending caller must also protect its own post-commit
memory patch against session changes and later edits. Results must not overwrite newer local
intent or acknowledge a later pending edit. Broadcast and storage events request an IDB reread;
they never carry authority or act as mandatory visibility waits.

The substrate does not yet own serializer baselines, field-level intent reconstruction, recovery
archives, cloud acknowledgements, startup UI, or network operations. Those remain integration
gates. Unsupported/newer database versions, blocked upgrade, versionchange and unavailable
storage must become visible unavailable/pending states with no silent old-key fallback.

## Recommended coexistence and recovery policy

Leave old writable progress and recovery keys untouched. Omit a compatibility projection until
there is a concrete consumer; any future new projection needs a different key/version and must
be disposable. Never replace `v2_progress` with a projection: there is no atomic IDB plus
localStorage commit, and a new client could overwrite an intervening old write before capturing
its unique bytes. Storage events and cache reads do not close that gap.

At first explicit migration, preserve the exact selected legacy bytes together with the parsed
owner and original season, import version and authoritative state in the IDB transaction.
Malformed/unknown/foreign-owner values become retained recovery material, not another owner's
progress. The inactive substrate only retains caller-supplied first-import raw bytes; the
recoverable source inventory and user discovery workflow are not implemented yet.

After first adoption, later observed legacy values remain recovery candidates. Startup, focus,
and notifications should discover available candidates and show a persistent recovery banner
with mode-aware comparison and export. Explicit reconciliation preserves both originals,
matches the signed-in owner, applies current-season policy, and rejects older reset epochs.
Equal-epoch divergent scalars require a choice; old timestamps cannot prove a safe winner.
Deleting or resetting new data must not clear the migration marker and reimport legacy data
on reopen. User-selected file import is a distinct operation from automatic migration.

This policy preserves available legacy bytes; it cannot recover every historical old write that
old clients themselves overwrote. It also cannot prevent old clients sending stale progress to
the cloud. Local authority among updated clients and cloud mixed-client safety are separate
claims.

## Signed-in rollout decision

Current `sync_user_game_mode_progress` accepts authenticated mode payloads and a Seasonal
number, but no client write version or session fence. Its latest body is in
`20261001224510_correlate_progress_sync_metadata_echoes.sql`. The current
`merge_manual_activity_progress` rejects lower reset epochs, accepts higher reset epochs, and
accepts incoming non-history values when reset epochs match
(`20260930150000_cap_api_update_task_lists.sql`). Consequently, existing reset epochs protect
some reset boundaries but do not retire old clients or prevent every equal-epoch stale scalar
write. Metadata is also independently writable through the existing RPC.

Enforceable retirement requires a separately authorized server write contract: identify every
browser progress writer, provide a new supported entry point, and reject obsolete entry points
or obsolete request versions. Cached code cannot be forced to notice a banner or send a new
version field. A frontend deployment alone is insufficient. Server/API gateway writers and
prestige/reset contracts require explicit compatibility review; #1086's held retirement is a
separate rollout and must not be used as implicit authorization.

The product choice is whether to accept limited mixed-client cloud guarantees with explicit
recovery, or require enforceable old-client write retirement before signed-in cutover. A
guest-only integration can be considered separately, but sign-in handoff must not silently
feed incompatible persistence into existing cloud startup. No server change or rollout is
included in this stage.

## Low friction upgrade and compatibility removal

Prefer a staged bridge that lets existing tabs continue and loads the new authority on natural
open or reload. The current installed Nuxt defaults enable app manifests, check for an outdated
build hourly, and automatically reload on later navigation after a manifest update or a route
chunk error. That installed navigation guard cannot be vetoed by simply adding another
manifest listener. A later coordinator must replace the automatic path, for example with
`emitRouteChunkError: 'manual'`, while retaining manifest detection and chunk-error emission.
It must also cover the `app.vue` hard reload/retry paths; pre-app inline entry recovery remains
separate. `persistState` only snapshots Nuxt `payload.state`, not Pinia progress, and
`restoreState` currently defaults to false. It does not prove the progress transaction
committed, preserve every modal/file/import state, or fence an old account's progress. The
repository has no custom update coordinator or service worker.

A future coordinator should reuse the manifest update signal, drain writes, then verify local
Saved and the exact accepted revision for a stable owner. It must exclude active imports,
resets, prestige, handoffs and unsaved UI work. Offline/pending cloud work can reload silently
only when exact owner/mode intent is locally durable and resumption is proven. Failed local
saves, conflicts and unapplied imports require deferral or exceptional recovery. Existing
local/cloud pending flags and the local write drain are useful
inputs, but no central workflow barrier currently covers all these operations. Other bridged
tabs can acknowledge their safe state through cooperative coordination; unbridged tabs cannot
participate. Idle time alone is not evidence of a committed save. Already-running legacy code
cannot acquire this future coordinator without loading a newer release, and a refresh-free
replacement of its installed persistence code is not a supported guarantee.

Keep compatibility in one temporary adapter/import boundary with explicit supported storage
and protocol versions. Callers should target one authoritative API, with no scattered old-key
branches and no permanent dual writes. Track integration and removal evidence in #1092 from
the first bridge PR: supported writers use the new protocol, required legacy/recovery imports
have explicit outcomes, existing operational error/recovery evidence shows no remaining
dependency, and new-only export plus rollback is verified. Use existing observable operations;
do not add invasive client tracking. A calendar deadline or a single bridge release does not
prove cached clients stopped writing. Legacy deletion or server rejection remains a separate
authorized action. #1086's cached-client hold concerns its own database retirement and is not
released by this browser bridge.

## Rollback and remaining acceptance

Untouched legacy snapshots cannot restore changes committed only to IDB. Before old-code
rollback, a new-aware exporter must read committed owner/mode records and retained recovery
material, produce a validated native backup with original season targeting, and verify its
round trip through the supported importer. A schema-compatible repair deployment that can
still read IDB is safer than deploying code that ignores it. No tested rollback exporter exists
in this stage; rollback is an integration gate.

The next PR should integrate the agreed surface coherently rather than a sequence of partial
authority switches. Its acceptance must use actual app stores in separate native renderers:
immediate write/release in both orders, ordinary edits, first save, same-time scalar changes,
selected/all resets and unrelated mode reload, reset epoch adoption followed by a valid edit,
put-success then transaction abort, quota/unavailable/blocked/newer-version failures,
A to B to A, crash/reopen, retained old-client writes, deletion reimport prevention and new-only
export recovery. Focused tests use modest workers; CI owns broad validation. W10 is incomplete
until those integration gates and the compatibility decision are resolved.
