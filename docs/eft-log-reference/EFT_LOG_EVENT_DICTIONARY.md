# EFT Log Event Dictionary

Purpose-first lookup for Escape from Tarkov (and EFT: Arena) local logs. Companion to
`EFT_LOG_EVENTS_REFERENCE.md` (full evidence catalogue). Everything here is backed by the verified
2026-08-09 (`H`) and 2026-08-29 (`C`, re-scanned and re-confirmed same day) snapshots of the local
corpus covering builds `0.16.8.0.37972` through `1.1.0.1.46911` (main) and Arena
`0.3.2.1.38001` / `0.4.2.5.42886`.

## How to use this file

Two lookup directions:

1. **"I want to know when X happens"** → use Part 1 (recipes). Find the goal, take the primary
   signal, and check the cautions column before wiring it into a tracker.
2. **"I saw this literal string in a log, what is it?"** → use Part 2 (A–Z by channel).

Legend used throughout:

- **Channels**: the log file a record appears in (`application`, `backend`, `push-notifications`,
  `output`, `errors`, `network-connection`, `network-messages`, `inventory`, `player`, `insurance`,
  `backendCache`, `backend_queue`, `objectPool`, `files-checker`, `spatial-audio`, `maperrors`,
  `aiData`/`aiErrors`, plus 0.16.x-only `notifications`, `traces`, `Default`, `pools`, `surprises`,
  `seasons`, `anim-events-container`, `assetBundle`, `health-system`; Arena has its own set
  including `lifecycle`, `web_socket`, `network_summary`, `arena_*`, `traces_all`).
- **Modes**: `P` regular PvP, `E` PvE, `S` PvP Seasons, `U` no marker (inherits session), `A` Arena.
  Only a direct gateway/WebSocket marker or `Session mode:` proves the environment.
- **Confidence**: `Direct` = the literal event/field was observed. `Correlated` = inferred from
  adjacent events. Never publish raw values; see the PII table in the reference.
- **Versions**: exact builds with direct evidence. `H-only` = observed only in the 2026-08-09
  historical snapshot (builds `1.0.2.5.43579`–`1.1.0.0.46657`, most no longer on disk). Absence from
  a listed build means "not in sampled sessions", never "removed".

---

## Part 1 — "How do I detect…" recipes

### Quests / tasks

| Goal                               | Primary signal                                                                                                                                                                                                           | Supporting signals                                                                                                                                                                                                                                                                                                                                        | Confidence & cautions                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Quest/task **accepted or started** | **No direct accept/start event exists.** Best cluster: `push-notifications` `Got notification \| ChatMessageReceived` whose payload carries quest text, description/success/fail template IDs, and `profileChangeEvents` | `output` quest/achievement activity (type, target, completed counters, template IDs); backend catalogue fetches `/client/quest/list`, `/client/quest/getMainQuestsList`, `/client/quest/chains`, `/client/quest/getMainQuestNotesList` (+ retry), `/client/repeatalbeQuests/activityPeriods` (route typo is real), `/client/completable-item/quests/list` | Correlated. Catalogue fetches are NOT transitions. No `/client/quest/accept` route was ever observed in H or C |
| Quest **condition progress**       | `player` channel: `Conditional is not available for finish. Conditional <ID> status:Started` (rejection diagnostic)                                                                                                      | `output` counters/targets; `inventory` read-quest-note/link rejections                                                                                                                                                                                                                                                                                    | Mostly diagnostics, not positive progress commits                                                              |
| Quest **completed**                | `backend` request/response for `/client/quest/complete`                                                                                                                                                                  | Success template text + reward `profileChangeEvents` in `ChatMessageReceived`; `output` quest completion family                                                                                                                                                                                                                                           | Direct route. A 200-style response line proves transport completion, not application-level success             |
| Quest **failed**                   | `backend` `/client/quest/fail` — **H-only route; not observed in C samples**                                                                                                                                             | Failure template in `ChatMessageReceived`; PvE offline quest finalization family in `output` (E mode)                                                                                                                                                                                                                                                     | Correlated in C; stack frames mentioning quest fail routines prove nothing                                     |
| Quest **note/link read**           | `inventory` read-quest-note/link operations (only rejection/conflict cases retained)                                                                                                                                     | `player` errors                                                                                                                                                                                                                                                                                                                                           | Failure-biased evidence                                                                                        |
| Task **handover** (give item X)    | **No reliable handover event.** `/client/game/profile/items/moving` is generic item mutation                                                                                                                             | Do not infer handover from generic moves                                                                                                                                                                                                                                                                                                                  | Gap — do not automate off this                                                                                 |
| Repeatable (daily/weekly) cycles   | `/client/repeatalbeQuests/activityPeriods` (+ retry)                                                                                                                                                                     | `/client/completable-item/quests/list`                                                                                                                                                                                                                                                                                                                    | Direct route; occurred in E and S                                                                              |

### Raid lifecycle

| Goal                                   | Primary signal                                                                                                                                                                                                      | Supporting signals                                                                                                                                                                                                 | Confidence & cautions                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Game mode** (PvP/PvE/Season)         | `application`/`output`: `Session mode: Regular` / `Session mode: Pve` / `Session mode: PvpSeason`                                                                                                                   | `backend` gateway host in URLs (`gw-pvp*`, `gw-pvp-season*`, `gw-pve*` — interpretation); `push-notifications` websocket host (`wsn-*`)                                                                            | Direct. `Regular` all 18 C builds; `Pve` sampled `0.16.8.0.37972`–`1.0.6.5.46221`; `PvpSeason` first at `1.1.0.0.46608`. Unknown mode must fail closed |
| **Matchmaking started**                | `output`: `----------MATCHING dateTime:<TIME>`; `application`: `TRACE-NetworkGameMatching <STAGE>`, `Matching with group id:<ID>`                                                                                   | `/client/match/group/*` routes; group notifications                                                                                                                                                                | Direct. Matching cancel: `Network game matching cancelled.` / `Local game matching cancelled.`                                                         |
| **Matchmaking complete**               | `application`: `MatchingCompleted:<N> real:<N> diff:<N>`                                                                                                                                                            | `output` mirror                                                                                                                                                                                                    | Direct, all 14 C raid builds + both Arena builds. Not map/player readiness                                                                             |
| **Server assigned** (IP:port, session) | `application`: `TRACE-NetworkGameCreate profileStatus:'Profileid:…, Status:…, RaidMode:…, Ip:<IP>, Port:<PORT>, Location:<MAP>, Sid:<SID>, GameMode:…, shortId:…'`                                                  | `push-notifications` `UserConfirmed` / `UserRoomStarted` / `UserMatchCreated`                                                                                                                                      | Direct but maximally sensitive — never publish IP/port/IDs                                                                                             |
| **Transport connected**                | `network-connection`: `Connect (address: <IP>:<PORT>)` → `Exit to the 'Initial' state` → `Enter to the 'Connecting' state (…, syn: True, asc: False)` → `Enter to the 'Connected' state (…, syn: False, asc: True)` | `output` mirrors; `network-messages` `rpi:…` counters                                                                                                                                                              | Direct, all 14 C raid builds + Arena. Connected ≠ raid started                                                                                         |
| **Map/location known**                 | `TRACE-NetworkGameCreate … Location:<MAP>`                                                                                                                                                                          | `scene preset path:<BUNDLE> rcid:<ID>`; `LocationLoaded`; `/client/locations`                                                                                                                                      | Direct                                                                                                                                                 |
| **World ready**                        | `output`: `World spawn confirmed` — **only from `1.0.0.0.41760`; never logged by 0.16.x**                                                                                                                           | 0.16.x fallback cluster: `GameSpawn` → `GameSpawned` (+ `PlayerSpawnEvent`)                                                                                                                                        | Direct. No universal `PlayerReady` event exists                                                                                                        |
| **Raid live (started)**                | `application`/`output`: `GameStarting` → `GameStarted`                                                                                                                                                              | `GameSpawn`, `GameRunned`, `GamePrepared`, `GameCreated`, `GamePooled` milestones                                                                                                                                  | Direct, all raid builds + Arena. Strongest start boundary                                                                                              |
| **Raid active**                        | `output` game-timer/session-time updates, world ticks, player sync                                                                                                                                                  | `network-connection` `Statistics (… rtt:…, lose:…, sent:…, received:…)`; `network-messages` counters                                                                                                               | Network activity alone is not gameplay proof                                                                                                           |
| **Transit / map switch**               | `application`/`output` (0.16.x also `Default` channel): `[Transit] Flag:<FLAG>, RaidId:<ID>, Count:<N>, Locations:<CHAIN>`                                                                                          | transit UI family in `output`                                                                                                                                                                                      | Direct. `EventPlayer:False` does not prove the player did/didn't transit                                                                               |
| **Raid ended**                         | `output`/`errors`: `LocalPlayer:OnGameSessionEnd(ExitStatus, pastTime, locationId, exitName)` — C builds `1.0.0.2.42157`, `1.0.2.0.43037`, `1.1.0.0.46657`, `1.1.0.1.46911`                                         | Structured `GameStopped … ExitStatus:<STATUS>` — **H-only** (`1.0.2.5.43579`, `1.0.4.0.44005`, `1.0.4.1.44236`); `backend` `/client/match/local/end` or `/client/match/exit`; `push-notifications` `UserMatchOver` | `OnGameSessionEnd` is not universal per raid. Never use a single marker as the sole end detector                                                       |
| **Outcome: survived/killed**           | Direct survival/killed-class `ExitStatus` — **H-only**                                                                                                                                                              | In C: no direct outcome line. `DeathScreen_Shown` (label ≠ death proof), `GameOverSaveStatus` (save receipt, not outcome), `PostRaid_Start`, `InteractiveMenuReady`                                                | Gap in C — outcome must stay `null`/unknown unless a direct marker returns                                                                             |
| **Result UI ready**                    | `output`: `InteractiveMenuReady` (6 C builds)                                                                                                                                                                       | `PostRaid_Start`, result-scene family                                                                                                                                                                              | Direct                                                                                                                                                 |
| **Back at menu / teardown**            | `network-connection`: `Disconnect (…)` → `Enter to the 'Disconnected' state (…, reason: <N>)`; remote variant `Receive disconnect (…)` (C: `1.0.6.0.46010`)                                                         | return-to-menu/unload families in `output`                                                                                                                                                                         | Disconnect never establishes outcome                                                                                                                   |

### Group / lobby / social

| Goal                                                    | Primary signal (channel: marker)                                                                                                                                             | Cautions                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Invite sent / accepted / declined / cancelled / expired | `push-notifications`: `GroupMatchInviteSend`, `GroupMatchInviteAccept`, `GroupMatchInviteDecline` (C: `0.16.8.0.37972`), `GroupMatchInviteCancel`, `GroupMatchInviteExpired` | Marker absence per build is sample-dependent            |
| Group aborted / capacity                                | `GroupMatchAbort` (C: `0.16.8.0.37972`); `GroupMaxCountReached` (C: `0.16.8.1.38114`)                                                                                        | Exact initiator/reason needs adjacent context           |
| Member ready / not ready                                | `GroupMatchRaidReady` / `GroupMatchRaidNotReady` (`isReady` + extended profile)                                                                                              | Group readiness ≠ local world readiness                 |
| Raid settings / start handoff                           | `GroupMatchRaidSettings`, `GroupMatchStartGame`                                                                                                                              | Settings include location, weather, bot/waves, PvE flag |
| Leader change / leave / kicked                          | `GroupMatchLeaderChanged`, `GroupMatchUserLeave`, `GroupMatchWasRemoved`                                                                                                     | —                                                       |
| Friend request in / accepted                            | `FriendsListNewRequest` (C: 5 builds), `FriendsListAccept`                                                                                                                   | —                                                       |
| Chat / trader mail / system mail                        | `ChatMessageReceived` (`eventId`, `uid`, `dt`, `dialogId`, `message`, `text`, `systemData`, `profileChangeEvents`)                                                           | Multiline payloads; sanitize before storing             |
| Popup from server                                       | `NotificationPopup` (message/image, button flags/duration)                                                                                                                   | —                                                       |

### Economy / items

| Goal                                          | Primary signal                                                                                                                                         | Cautions                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Flea sale                                     | `push-notifications`: `RagfairOfferSold` (sold item, count, buyer nickname, handbookId)                                                                | Buyer nickname is PII                             |
| Flea rating change                            | `RagfairNewRating` (`isRatingGrowing`, rating)                                                                                                         | —                                                 |
| Balance / purchase / stash rows / battle-pass | `ExpansionsAccountBalanceIncreased`, `ExpansionsAccountOfferPurchased`, `ExpansionsAccountTarcoinBalance`, `StashRows`, `BattlePassUniversalDocuments` | Amounts are account data                          |
| Insurance cost                                | `backend` `/client/insurance/items/list/cost` (E and P)                                                                                                | Only cost route exists                            |
| Insurance reconciliation problem              | `insurance`: `Items to insure does not contain: <ITEM>` (C: 5 builds)                                                                                  | No success/payment/expiry/return events exist     |
| Inventory rejected                            | `inventory`: `[<ID>\|<NICK>\|Profile]<CORR> - Client operation rejected by server:<CODE> - OperationType:<OP>`                                         | Failure-only evidence; no universal commit marker |
| Queued inventory command failed               | `backend_queue` JSON fragments: `Move`, `ApplyInventoryChanges`, `Repair`, `buy_from_trader`                                                           | Fragments; boundaries unreliable                  |
| Cache mismatch of static data                 | `backend`: `cache: mis-matched, old etag:…, new etag:…` (C: 4 builds `1.0.6.0.46010`+)                                                                 | Signals stale local cache                         |

### Client/runtime health

| Goal                                 | Primary signal                                                                                                                                                                                                                                              | Cautions                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Anti-cheat lifecycle                 | `application`: `Start loading dll '<BATTLEYE_DLL>'` … `BEClient exit successfully`                                                                                                                                                                          | —                                                                        |
| File integrity                       | `files-checker`: `ExecutablePath:`, `Consistency ensurance is launched`, `Consistency ensurance is succeed. ElapsedMilliseconds:<N>`                                                                                                                        | Channel absent from all 0.16.x sessions in C; no failure shape retained  |
| Audio ready                          | `spatial-audio`: `SpatialAudioSystem Initialized`, `Success initialize BetterAudio`, DSP buffer/quality lines                                                                                                                                               | Loading context, not a raid boundary                                     |
| Audio degradation                    | `ReverbPluginChecker enabled:…`, reverb reset attempts (C: `1.0.1.0.42625`), exhaustion, mic failure                                                                                                                                                        | —                                                                        |
| Link quality                         | `network-connection` `Statistics (… rtt/lose/sent/received)`; `network-messages` `rpi:<N>\|rwi:<N>\|rsi:<N>\|rci:<N>\|ui:<N>\|lui:<N>\|lud:<N>`                                                                                                             | Abbreviations are opaque; loss may be scientific notation                |
| Processing overload                  | `network-connection`: `Thread processing exceeded the limit [<N>/<N>]` (C: `1.0.1.0.42625`); `Thread was being aborted.`                                                                                                                                    | Cause not exposed                                                        |
| Asset/pool failures                  | `objectPool`: `Returning asset to pool when the pool is already destroyed`; `Failed to create item with ID:…` (C: `1.0.0.2.42157`); bundle-not-loaded; `assetBundle` missing-manifest/duplicate-release errors                                              | —                                                                        |
| Item lookup / quest-condition errors | `player`: `Could not find item with id:…`; `Conditional is not available for finish…`                                                                                                                                                                       | —                                                                        |
| Spawn-marker fixes                   | `maperrors` (H-only channel; none in C): `SpawnPointMarker … fix message:…`, `SpawnPointMarkers fixes:<N>`, `… will be deleted … not on backend`                                                                                                            | Channel absence ≠ removal                                                |
| Uncategorized 0.16.x chatter         | `Default` channel (0.16.x only): locale duplicates, hideout `Address not found`, `Already registered object`, weapon-shell warnings, exceptions, `[Transit]` lines                                                                                          | Not an error channel per se; never present in 1.0.0.0+ envelopes         |
| Arena match state                    | Arena `lifecycle`/`web_socket`: `ApplicationState: Idle\|Matching\|Gameplay`, `MatchingProgressState: None\|MatchingStarted\|GameFound\|ConnectingToServer\|WorldCreating\|Leaving\|Participation recreate`, `GameplayState: None\|Running\|Dead\|Finished` | Use before generic Unity timing mirrors; short sessions log only subsets |

---

## Part 2 — A–Z event dictionary (by channel)

### `application`

| Event literal                                                               | Meaning                                                                 | Direct versions                                                                       | Notes                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `Application awaken, updateQueue:'…'`                                       | Client/Unity startup                                                    | All builds                                                                            | First reliable session marker            |
| `<Category> settings:` + JSON                                               | Loaded settings snapshot (graphics/audio/controls/gameplay…)            | All builds                                                                            | Privacy-sensitive                        |
| `SelectProfile ProfileId:… AccountId:…`                                     | Legacy profile selection                                                | `0.16.8.0.37972`–`1.0.2.0.43037` (C) + H through `1.0.4.1.44236`                      | Keep legacy parser branch                |
| `PrepareSelectedProfileLocally …`                                           | Modern profile prepare phase                                            | C: `1.0.6.0.46010`–`1.1.0.1.46911`; H from `1.0.4.6.44802`                            | Pair with Complete                       |
| `CompleteSelectedProfile …`                                                 | Modern profile completion                                               | Same as above                                                                         | Profile flow done                        |
| `Session mode: <MODE>`                                                      | Direct mode declaration                                                 | All 18 C builds (`Regular`); `Pve` ≤`1.0.6.5.46221`; `PvpSeason` from `1.1.0.0.46608` | Highest-value mode signal                |
| `TRACE-NetworkGameMatching <STAGE>`                                         | Matchmaking progress stages                                             | All raid builds                                                                       | Stages opaque                            |
| `Matching with group id:<ID>`                                               | Group association                                                       | All raid builds                                                                       | —                                        |
| `Network game matching cancelled.` / `Local game matching cancelled.`       | Cancellation paths                                                      | Sampled 1.0.4+                                                                        | Network vs local distinction             |
| `TRACE-NetworkGameCreate profileStatus:'…'`                                 | Server assignment: RaidMode, Ip, Port, Location, Sid, GameMode, shortId | All raid builds                                                                       | PII-critical                             |
| `LocationLoaded` / `GameCreated` / `GamePooled` / `GamePrepared`            | Scene/game-object milestones with timings                               | All raid builds                                                                       | Ordered                                  |
| `GameSpawn` / `GameSpawned` / `GameRunned` / `GameStarting` / `GameStarted` | Spawn→live sequence                                                     | All raid builds                                                                       | `GameStarted` = strongest start          |
| `[Transit] Flag:…, RaidId:…, Count:…, Locations:…`                          | Map-transition state                                                    | All raid builds                                                                       | 0.16.x also logs it on `Default` channel |
| `scene preset path:<BUNDLE> rcid:<ID>`                                      | Selected map asset                                                      | All raid builds                                                                       | Join to map detection                    |
| `GC mode switched`, `GC::Collect*`, `ClientMetricsEvents()`                 | Memory/perf telemetry                                                   | All builds                                                                            | —                                        |
| `Start loading dll '…'` … `BEClient exit successfully`                      | BattlEye lifecycle                                                      | All builds                                                                            | —                                        |
| `Reason:…, Position:…, SpeedLimit:…, CurrentState:…`                        | Movement restriction/validation                                         | All builds                                                                            | Diagnostic                               |
| `Data prepare operation has failed: <EXCEPTION>`                            | Profile/app data preparation failure                                    | Sampled                                                                               | Error path                               |

No raid-end event exists on this channel; end evidence lives in `errors`, `output`, `backend`,
`push-notifications`, `network-connection`.

### `backend`

| Event literal                                                                                           | Meaning                                                                                                  | Direct versions                                                                                                                               | Notes                                                         |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `---> Request HTTPS, id [<ID>]: URL: https://…`                                                         | Outbound API request                                                                                     | All builds                                                                                                                                    | Correlate with response by `id`                               |
| `<--- Response HTTPS, id [<ID>]: URL:…, DownloadSeconds:…, ParseSeconds:…, SumSeconds:…, responseText:` | Transport completion + latency                                                                           | All builds                                                                                                                                    | Not application-level success                                 |
| `crc:` segment on request/response                                                                      | Legacy cache signature                                                                                   | H-only (`1.0.2.5.43579`, `1.0.4.0.44005`, `1.0.4.1.44236`); zero in C                                                                         | —                                                             |
| `<--- Error! HTTPS: …, result:…, isNetworkError:…, isHttpError:…, responseCode:…`                       | Transport vs HTTP failure classification                                                                 | C: `1.0.0.2.42157`, `1.0.1.0.42625`; H broadly                                                                                                | `ProtocolError` inside, C: same 2 builds (H: `1.0.6.5.46221`) |
| `Request <URL> will be retried after <N> sec, retry:<N> from retries:<N>`                               | Scheduled retry                                                                                          | C: `0.16.8.0.37972`, `1.0.0.2.42157`, `1.0.1.0.42625`, `1.0.6.0.46010`, `1.1.0.1.46911`; H: `1.0.5.0.45272`, `1.0.6.5.46221`, `1.1.0.0.46608` | —                                                             |
| `cache: mis-matched, old etag:…, new etag:…`                                                            | Static-data cache version mismatch                                                                       | C: `1.0.6.0.46010`, `1.1.0.0.46624`, `1.1.0.0.46657`, `1.1.0.1.46911`                                                                         | —                                                             |
| `BackendServerSideException: <CODE> - <RULE>`                                                           | Server business-rule failure (missing item, offline player, stack order, dialogue node, quantity limit…) | C: 8 builds (`1.0.0.0.41760`…`1.1.0.1.46911`)                                                                                                 | Mostly E                                                      |
| WSS open/close/reconnect/abrupt-termination shapes                                                      | Account/notification channel lifecycle                                                                   | H-only retained shapes                                                                                                                        | Zero in C re-scan (not a removal verdict)                     |
| `NOTIFICATION <ID> <TYPE> {…}`                                                                          | Commerce notification JSON                                                                               | Sampled                                                                                                                                       | Types under `push-notifications`                              |
| `/5xx-error-landing?…`                                                                                  | Upstream gateway failure page                                                                            | H: `1.0.6.5.46221`                                                                                                                            | Proxy-level failure                                           |

Endpoint inventory (139 distinct routes, exact C set verified): see
`EFT_LOG_EVENTS_REFERENCE.md` §backend. Quest-relevant: `/client/quest/complete` (direct),
`/client/quest/fail` (H-only in evidence), `/client/quest/list`, `/client/quest/getMainQuestsList`,
`/client/quest/chains`, `/client/quest/getMainQuestNotesList` (+retry),
`/client/repeatalbeQuests/activityPeriods` (+retry), `/client/completable-item/quests/list`.

### `backendCache`

| Event literal                                     | Meaning                                 | Direct versions                                                                          |
| ------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `BackendCache.Load File name:<PATH>, URL:<ROUTE>` | Static-response cache lookup (hit path) | C: `1.0.0.0.41760`–`1.0.2.0.43037`; H: `1.0.2.5.43579`, `1.0.4.0.44005`, `1.0.4.1.44236` |
| `BackendCache.Load File name:<PATH> - NOT exists` | Cache miss                              | Same builds                                                                              |

Cached routes observed: locale/en, settings, traderSettings, locations, items, customization,
globals, languages, game/config, menu/locale/en, game/mode. No write/invalidate/expiry events.

### `backend_queue`

| Event literal                                              | Meaning                     | Direct versions                                                                                                   |
| ---------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Error: Inventory queue failed on the following commands:` | Queued inventory ops failed | Channel-set (H) + C files in `0.16.8.0.37972`, `1.0.0.2.42157`, `1.0.1.0.42625`, `1.0.6.0.46010`, `1.1.0.1.46911` |
| `{"Action":"Move", …}`                                     | Failed move payload         | Channel-set                                                                                                       |
| `{"Action":"ApplyInventoryChanges","changedItems":[…]}`    | Failed batch change         | H: `1.0.6.5.46221`                                                                                                |
| `{"Action":"Repair","target":…,"repairKitsInfo":…}`        | Failed repair               | H: `1.0.6.5.46221`                                                                                                |
| `{"type":"buy_from_trader", …}`                            | Failed trader purchase      | H: `1.0.6.5.46221`                                                                                                |

### `push-notifications`

Transport: `new params received url: wss://…/push/notifier/getwebsocket/<CHANNEL>`,
`LongPollingWebSocketRequest received:<N> / result Count:<N> MessageType:<TYPE>`,
`Received Service Notifications Ping` / `ChannelDeleted`, plus dispose/cancel/timeout/TLS failure
shapes. Typed markers (all direct; versions = C re-scan):

| Marker                              | Meaning                                                          | Direct C versions                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `BattlePassUniversalDocuments`      | Battle-pass document balance                                     | Sampled (H set)                                                                                                       |
| `ChatMessageReceived`               | Chat / trader & system mail / quest text + `profileChangeEvents` | 17 builds (all but `1.1.0.0.46608`)                                                                                   |
| `CustomizationUpdateRequired`       | Customization refresh request                                    | `1.0.1.1.42751`                                                                                                       |
| `ExpansionsAccountBalanceIncreased` | Currency increase                                                | Sampled (H set)                                                                                                       |
| `ExpansionsAccountOfferPurchased`   | Offer purchased                                                  | Sampled (H set)                                                                                                       |
| `ExpansionsAccountTarcoinBalance`   | Tarcoin balance                                                  | Sampled (H set)                                                                                                       |
| `FriendsListAccept`                 | Friend request accepted                                          | `0.16.8.0.37972`, `0.16.8.1.38114`, `1.0.6.0.46010`, `1.1.0.1.46911`                                                  |
| `FriendsListNewRequest`             | New inbound friend request                                       | `0.16.8.1.38114`, `0.16.9.5.40743`, `1.0.2.0.43037`, `1.1.0.0.46657`, `1.1.0.1.46911`                                 |
| `GroupMatchAbort`                   | Group matchmaking aborted                                        | `0.16.8.0.37972`                                                                                                      |
| `GroupMatchInviteAccept`            | Invite accepted                                                  | 8 builds                                                                                                              |
| `GroupMatchInviteCancel`            | Invite cancelled                                                 | `1.1.0.1.46911`                                                                                                       |
| `GroupMatchInviteDecline`           | Invite declined                                                  | `0.16.8.0.37972`                                                                                                      |
| `GroupMatchInviteExpired`           | Invite expired                                                   | Sampled (H set)                                                                                                       |
| `GroupMatchInviteSend`              | Invite sent                                                      | 7 builds                                                                                                              |
| `GroupMatchLeaderChanged`           | Leader changed                                                   | 6 builds                                                                                                              |
| `GroupMatchRaidNotReady`            | Member unreadied                                                 | 10 builds                                                                                                             |
| `GroupMatchRaidReady`               | Member readied (`isReady`)                                       | 11 builds                                                                                                             |
| `GroupMatchRaidSettings`            | Group raid settings handoff                                      | 8 builds                                                                                                              |
| `GroupMatchStartGame`               | Group start-game handoff                                         | 11 builds                                                                                                             |
| `GroupMatchUserLeave`               | Member left                                                      | 6 builds                                                                                                              |
| `GroupMatchWasRemoved`              | Member removed                                                   | 8 builds                                                                                                              |
| `GroupMaxCountReached`              | Group capacity hit                                               | `0.16.8.1.38114`                                                                                                      |
| `NotificationPopup`                 | Server-driven popup                                              | `0.16.8.1.38114`, `1.0.1.0.42625`                                                                                     |
| `RagfairNewRating`                  | Flea rating change                                               | `1.0.2.0.43037`                                                                                                       |
| `RagfairOfferSold`                  | Flea sale                                                        | `0.16.9.5.40743`, `1.0.2.0.43037`, `1.0.6.0.46010`                                                                    |
| service `Ping`                      | Keepalive                                                        | All builds + both Arena builds                                                                                        |
| service `ChannelDeleted`            | Notification channel deleted server-side                         | 16 builds                                                                                                             |
| `StashRows`                         | Stash row change                                                 | Sampled (H set)                                                                                                       |
| `UserConfirmed`                     | User/match confirmation snapshot                                 | 14 builds                                                                                                             |
| `UserMatchCreated`                  | Match created (mode, location, side, version)                    | `1.0.1.0.42625`, `1.0.1.1.42751`, `1.0.2.0.43037`, `1.0.6.0.46010`, `1.1.0.0.46624`, `1.1.0.0.46657`, `1.1.0.1.46911` |
| `UserMatchOver`                     | Match over                                                       | C main: `0.16.8.0.37972`, `0.16.8.1.38114`, `1.0.0.1.41967`, `1.0.0.2.42157`; Arena: both                             |
| `UserRoomStarted`                   | Room started                                                     | `1.0.1.0.42625`, `1.0.1.1.42751`, `1.0.2.0.43037`                                                                     |

Filename convention: `notifications.log` in 0.16.x (record channel may still say
`push-notifications`); `push-notifications_000.log` from `1.0.0.0.41760`.

### `network-connection` / `network-messages`

| Event literal                                                         | Meaning                                  | Direct versions                                         |
| --------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `Connect (address: <IP>:<PORT>)`                                      | Connection attempt                       | All raid builds + Arena                                 |
| `Exit to the 'Initial' state (address: …)`                            | Leaving initial state                    | Same                                                    |
| `Enter to the 'Connecting' state (address: …, syn: True, asc: False)` | Handshake phase                          | Same                                                    |
| `Enter to the 'Connected' state (address: …, syn: False, asc: True)`  | Transport connected (strongest boundary) | Same                                                    |
| `Enter to the 'Disconnected' state (address: …, reason: <N>)`         | Terminal local teardown                  | Same                                                    |
| `Disconnect (address: …)` / `Send disconnect (… reason:<N>)`          | Local teardown request                   | Same                                                    |
| `Receive disconnect (…)`                                              | Remote teardown                          | C: `1.0.6.0.46010`                                      |
| `Statistics (… rtt:<N>, lose:<N>, sent:<N>, received:<N>)`            | Link health snapshot                     | 14 raid builds + Arena                                  |
| `Thread was being aborted.`                                           | Network worker termination               | 10 builds                                               |
| `Thread processing exceeded the limit [<N>/<N>]`                      | Processing overrun                       | C: `1.0.1.0.42625`; H: `1.0.2.5.43579`, `1.0.5.0.45464` |
| `rpi:<N>\|rwi:<N>\|rsi:<N>\|rci:<N>\|ui:<N>\|lui:<N>\|lud:<N>`        | Periodic 7-value counter record          | All builds; abbreviations opaque                        |

### `output` (umbrella transcript — dedupe against source channels)

Key unique families not mirrored from a dedicated channel:

| Family                                                                     | Meaning                                | Direct versions                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `----------MATCHING dateTime:<TIME>`                                       | Matchmaking start anchor               | 11 C builds (`1.0.0.0.41760`+)                                                         |
| `World spawn confirmed`                                                    | World-ready marker                     | `1.0.0.0.41760`–`1.1.0.1.46911` only; **never in 0.16.x**                              |
| `PlayerSpawnEvent`, `GameSpawn`, `GameSpawned`                             | Player/game spawn timings              | All raid builds (0.16.x world-ready fallback)                                          |
| `GameStopped … ExitStatus:<STATUS> PlayTime:…`                             | Structured raid end + outcome          | **H-only** (`1.0.2.5.43579`, `1.0.4.0.44005`, `1.0.4.1.44236`); zero in C              |
| `LocalPlayer:OnGameSessionEnd(ExitStatus, pastTime, locationId, exitName)` | Raid-end callback                      | C: `1.0.0.2.42157`, `1.0.2.0.43037`, `1.1.0.0.46657`, `1.1.0.1.46911` (+ 9 H builds)   |
| `GameOverSaveStatus received. ErrorCode:<N>…`                              | Result-save receipt                    | C: `1.0.6.0.46010`, `1.0.6.5.46221`, `1.1.0.0.46624`, `1.1.0.0.46657`, `1.1.0.1.46911` |
| `PostRaid_Start`                                                           | Post-raid pipeline start               | Same 5 C builds                                                                        |
| `DeathScreen_Shown`                                                        | Result-screen timing (NOT death proof) | Same 5 C builds                                                                        |
| `InteractiveMenuReady`                                                     | Result UI usable                       | 6 C builds (adds `1.1.0.1.46777`)                                                      |
| Quest/achievement activity                                                 | Condition linkage, counters, templates | Channel-set                                                                            |
| Game timer / session-time updates                                          | Raid-clock reconstruction              | Channel-set                                                                            |
| Ending-condition evaluation                                                | End-of-raid condition checks           | Channel-set                                                                            |
| PvE offline quest finalization                                             | End-of-local-PvE quest processing      | Sampled E builds                                                                       |

Everything else in `output` mirrors `application`, `backend`, `push-notifications`, `inventory`,
`errors`, `aiData`, `spatial-audio` — a source-prefixed duplicate is one event.

### `errors`

Root exceptions + mirrors of every source channel (do not double-count source-prefixed lines).
H-only structured raid-end mirrors: `NetworkGame.GameStopped received. ExitStatus:…` and
`GameOverSaveStatus received. ErrorCode:…` (first 3 H builds). Otherwise: generic runtime
exceptions, item-tree deserialization, stash/hideout placement overflow, inventory queue failures,
capacity/quantity/stack constraints, quest lookups, profile selection failures, HTTP/TLS/gateway
failures, abnormal WebSocket termination, notification parse mismatches, asset/model/pool creation
failures, script serialization-layout mismatch, embedded browser/audio-driver failures.

### `inventory`

| Event literal (shape)                                                                             | Meaning                                       | Direct versions                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| `[<ID>\|<NICK>\|Profile]<CORR> - Client operation rejected by server:<CODE> - OperationType:<OP>` | Server rejected move/magazine/search/note ops | 7 C builds                           |
| `Cannot put item … to slot … because it contains item …`                                          | Slot/attachment occupied                      | C: `1.1.0.0.46657`                   |
| `No parent inventory … activity from item:…`                                                      | Orphaned item activity                        | C: `0.16.8.0.37972`, `1.0.0.2.42157` |
| `operation can't be created … cant find by …`                                                     | Stale server-side item reference              | 4 C builds                           |
| `… is blocked … with <WORLD_OBJECT>`                                                              | Physical constraint                           | Channel-set                          |
| `… is too far away from <POSITION>`                                                               | Range validation                              | C: `1.0.1.0.42625`, `1.0.2.0.43037`  |
| `Cloned item ID desync. Expected ID:…, real ID:…`                                                 | Replication mismatch                          | Channel-set                          |
| Quest note/link conflicts                                                                         | Note already read / missing                   | Channel-set                          |

### `player`, `insurance`, `files-checker`, `maperrors`, `objectPool`, `spatial-audio`

| Channel         | Event literal                                                                                                                                                        | Meaning                                                         | Direct versions                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `player`        | `Could not find item with id:<ID>`                                                                                                                                   | Item lookup failure                                             | 5 C builds                                               |
| `player`        | `Conditional is not available for finish. Conditional <ID> status:Started`                                                                                           | Quest condition not finishable                                  | H channel-set; 0 in C samples                            |
| `insurance`     | `Items to insure does not contain: <ITEM>`                                                                                                                           | Insurance reconciliation warning (23 shapes, all name variants) | 5 C builds + 7 H builds                                  |
| `files-checker` | `ExecutablePath:` / `Consistency ensurance is launched` / `… succeed. ElapsedMilliseconds:<N>`                                                                       | Integrity-check lifecycle                                       | C: `1.0.0.0.41760`+ (15 builds); none in 0.16.x sessions |
| `maperrors`     | `SpawnPointMarker Id:… fix message:…` / `SpawnPointMarkers fixes:<N>` / `<N> SpawnPointMarker will be deleted … not on backend`                                      | Spawn-marker corrections                                        | H-only (`1.0.5.0.x`, `1.0.6.5.x` builds); no C file      |
| `objectPool`    | `Returning asset to pool when the pool is already destroyed`                                                                                                         | Teardown race                                                   | 9 C builds                                               |
| `objectPool`    | `Failed to create item with ID:<ID> and Name:<NAME>`                                                                                                                 | Item instantiation failed                                       | C: `1.0.0.2.42157`; H: `1.1.0.0.46608`                   |
| `objectPool`    | `<BUNDLE> is not loaded. You should load it first.`                                                                                                                  | Bundle unavailable                                              | H: `1.1.0.0.46608`                                       |
| `spatial-audio` | `Current DSP buffer length:<N>, buffers num:<N>` / `Target audio quality = <Q> <N>` / `SpatialAudioSystem Initialized`                                               | Audio init/config                                               | 15-build raid set                                        |
| `spatial-audio` | `Success initialize BetterAudio` / `ReverbPluginChecker enabled:…` / `Reverb reset attempt <N>/<N>` / exhausted / `CheckMicrophone failed. Devices:` / hard fallback | Audio health + recovery                                         | Mixed; reverb reset C: `1.0.1.0.42625`                   |

### 0.16.x-only and special channels

| Channel                 | Builds                                               | Content                                                                                                                                             |
| ----------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notifications`         | `0.16.8.0.37972`, `0.16.8.1.38114`, `0.16.9.5.40743` | Legacy notification stream (records still say `push-notifications`)                                                                                 |
| `traces`                | same 3 builds                                        | Legacy umbrella trace (backend payloads + runtime/error mirrors)                                                                                    |
| `Default`               | same 3 builds (40 files)                             | Uncategorized warnings/errors (locale duplicates, `Address not found`, `Already registered object`, weapon-shell warnings, exceptions, `[Transit]`) |
| `pools` (main)          | `0.16.8.0.37972`                                     | Legacy pool channel → later `objectPool`                                                                                                            |
| `surprises`             | `0.16.8.1.38114`                                     | Armband/body-customization mesh lookup                                                                                                              |
| `seasons`               | `1.0.0.0.41760`, `1.0.0.1.41967`, `1.0.0.2.42157`    | Seasonal-material fixer (not mode proof)                                                                                                            |
| `anim-events-container` | `1.0.0.0.41760`, `1.0.0.2.42157`                     | Animation-event consumer conflicts                                                                                                                  |
| `assetBundle`           | 5 C builds (`0.16.8.1.38114`…`1.0.6.5.46221`)        | Missing-manifest bundle / duplicate-release errors                                                                                                  |
| `health-system`         | `1.1.0.0.46624`                                      | Health/skill-buff config error                                                                                                                      |

### Arena

| Family                                                             | Meaning                                                                                                                                                                                                          | Builds                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Core channels                                                      | `application`, `backend`, `arena_backlog`, `arena_preset_selection`, `arena_static_data`, `errors`, `lifecycle`, `network_summary`, `notifications`, `spatial-audio`, `traces`, `traces_all`, `web_socket`       | both                       |
| `lifecycle`/`web_socket` states                                    | `ApplicationState: Idle/Matching/Gameplay`; `MatchingProgressState: None/MatchingStarted/GameFound/ConnectingToServer/WorldCreating/Leaving/Participation recreate`; `GameplayState: None/Running/Dead/Finished` | both (subsets per session) |
| `MatchingCompleted`, `GameStarted`, `LocationLoaded`, spawn family | Same lifecycle semantics as main game                                                                                                                                                                            | both                       |
| service `Ping`, `UserMatchOver`                                    | Notification keepalive + match end                                                                                                                                                                               | both                       |
| `gameMode-debug`                                                   | Game-mode leave diagnostic                                                                                                                                                                                       | `0.3.2.1.38001`            |
| `pools`                                                            | Pool/asset diagnostic                                                                                                                                                                                            | `0.4.2.5.42886`            |
| `network-connection`/`network-messages`                            | Same transport semantics as main                                                                                                                                                                                 | both (1 file each)         |

---

## Part 3 — What the logs cannot answer (do not automate off these)

| Question                                               | Status                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| "When exactly did the player extract?"                 | Only survival-class `ExitStatus` proves it — **H-only**. In C, outcome is not directly logged; keep unknown          |
| "Was the player killed?"                               | `DeathScreen_Shown` is a timing label, not proof; no direct killed marker in C                                       |
| "Which quest did the user just accept?"                | No accept event/route; correlate `ChatMessageReceived` quest-template text + `profileChangeEvents`                   |
| "Did the user hand over the task item?"                | No handover event; `/client/game/profile/items/moving` is generic                                                    |
| "Did insurance pay out / items return?"                | No success, payment, expiry, return-timer, or returned-item event exists                                             |
| "Is the player ready?" (single event)                  | No universal `PlayerReady`; use the readiness cluster                                                                |
| "What exactly happened at raid end in current builds?" | Only `OnGameSessionEnd` (4 C builds) + `UserMatchOver` + `/client/match/local/end \| exit`; not every raid logs them |
| "What do `rpi/rwi/rsi/rci/ui/lui/lud` mean?"           | Opaque in all evidence; treat as opaque counters                                                                     |

## Part 4 — Maintaining these docs (no manual log reading)

`.eft_log_audit.py` (same folder) is the re-audit tool. It is read-only and privacy-safe: it emits
only aggregate counts, version presence, and normalized endpoint/marker names — never raw messages,
IDs, addresses, or nicknames.

```bash
# Full one-pass audit (corpus, channels, modes, signatures, endpoints, notifications, arena)
python .eft_log_audit.py \
  --main-root "C:/Battlestate Games/Escape from Tarkov/Logs" \
  --arena-root "C:/Battlestate Games/Escape from Tarkov Arena/Logs" \
  --section all --out audit_report.json

# Compare endpoints against the reference doc (prints shared/added/missing delta)
python .eft_log_audit.py --main-root "…" --arena-root "…" \
  --section endpoints --reference EFT_LOG_EVENTS_REFERENCE.md

# Single sections: corpus | channels | modes | signatures | endpoints | notifications | arena | shapes
# shapes accepts --channels application,backend to dump normalized message shapes for a channel
```

Update workflow after each new game version: run `--section all --out`, diff `signatures`/
`notifications`/`channels` version maps against the tables above, add new versions to the build
tables in `EFT_LOG_EVENTS_REFERENCE.md`, extend recipes only when a signal is _directly_ verified,
and record absence as "not in sampled sessions" — never as removal.
