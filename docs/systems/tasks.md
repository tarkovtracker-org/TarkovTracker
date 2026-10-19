# Tasks and needed items

Part of the [systems spec](./README.md): summary, flow, files, and invariants per system.

## Task search

The initial route `q` filters tasks immediately, including tasks loaded later. Search comparisons
trim whitespace and ignore case. Later typing and route changes retain the 180 ms debounce;
clearing search cancels any pending update and restores the visible list immediately.

The app-bar search (`app/features/omnibar/AppSearch.vue`) replaced the page search boxes on Tasks and
Needed Items (Resources keeps its own). There, typing writes the page's `q` (debounced 150 ms, with `router.replace`) and its dropdown
offers jump results for the other entities; elsewhere the dropdown jumps to tasks, items, or hideout
stations. Opening a `?task=` link clears `q` first so the linked task is not filtered out.
Task deep-link cleanup retains the selected status filter when removing `task` from the URL, so
the focused task remains visible after route preferences synchronize.

## Task views

The route picks the view (`app/utils/taskRouteView.ts`): `/tasks` is the list of every trader's
tasks, `/tasks/traders` one trader at a time (`trader` param, picked from a strip of traders with
tasks left and their counts), `/tasks/maps` one map and `/tasks/graph` the trader graph. Tabs in the
page header (`app/features/tasks/TaskViewTabs.vue`) switch views and carry the search `q` across,
including a search still being debounced into the URL; sort, trader and map come back from
preferences, and so does status everywhere except Graph, which always shows every status without
overwriting the saved one. Graph also drops the sort control, since its layout follows dependencies.
The Graph canvas needs the `lg` breakpoint (1024px). Below it the Graph tab stays in the header with a
monitor icon and a screen-reader note. The narrow `/tasks/graph` route hides the mounted toolbar
and replaces the canvas with an explanation that links to Traders (selected trader, saved status,
sort mode, sort direction and search carried in the URL). Below `sm` the tabs hide their primary
icons while Graph keeps its monitor hint,
so all four fit on one row at 333px. The sidebar keeps one Tasks entry,
highlighted on every view. No default-view selection is saved; the stored
`taskPrimaryView` preference follows the route and is kept for compatibility. Legacy `/tasks?view=<view>` links are replaced by the matching route with the other
params kept (`app/middleware/tasks-legacy-view.global.ts`).

## Filters and page settings

Tasks, Needed Items and Hideout share one pattern built from `app/components/ui/`:

- **Filters** (`FiltersPopover`, `FilterSection`, `PreferenceSwitch`): on Tasks and Needed Items, a
  toolbar button showing the active count opens everything that changes _which_ items show. Its
  Reset clears every saved filter, including ones idle in the current view. Hideout has no Filters
  menu: its station status tabs stay in the toolbar, and its display and prerequisite switches live
  in the Settings drawer.
- **Active filter chips** (`ActiveFilterChips`): one removable chip per filter that is narrowing the
  current view. Clear all, shown when there are several, clears only those visible filters. A
  filter that cannot apply to the current view gets no chip and does not count: team-shared off the
  whole team's Available tab, map-only filters off Maps, and the Kappa-only filter on the Hideout
  scope, where it is disabled.
- **Settings** (`SettingsButton`, `SettingsDrawer`, `PreferenceSettingGroups`): how items _look or
  behave_. Tasks and Hideout keep a drawer, docked beside the content on wide screens and an overlay
  otherwise (`usePageSettingsDrawer`). Needed Items has no drawer; its appearance options are the
  toolbar view controls.
- Navigation stays outside both menus: task status tabs and the team view selector on Tasks, and
  the All, Tasks and Hideout scope tabs on Needed Items.
- **Sort** (`SortControl`): the sort select plus a direction button.

Task types (`useTaskContentFilters`) are additive: a task shows when it belongs to any selected type.
An empty saved selection already means every type, so the last selected type stays locked on. Card
display, status tab visibility and behavior preferences live in `useTaskDisplaySettings`; the
failed-task repair action shows under Behavior only while failed tasks exist. The Hideout drawer's
switches are read-only while the help tour points at it. Hideout always lists stations whose next
level has its station, skill and trader prerequisites met first (item requirements do not count),
keeping upstream order within each group, so it has no sort setting. Maxed cards already show only
"Max station level reached", so there is no page-wide collapse setting either; each card keeps its
own collapse toggle. The drawer holds only the availability requirements. The legacy
`hideout_sort_ready_first` and `hideout_collapse_completed` columns are no longer read or written.

## Hidden tasks

The eye button in a task card's header (or its right-click menu) hides the task from task lists (`useTaskHiding`, stored in the
synced `hiddenTaskIds` preference / `user_preferences.hidden_task_ids`). Hiding is view-only: it
never completes, fails or unlocks anything, so a hidden task still gates its successors. A toast
offers Undo, and the same button unhides it. On the Maps view the card also shows a map-marker
button (`TaskMapVisibilityToggles`) for the separate map-view-only hidden state
(`mapHiddenTaskIds`, keyed by task ID, so it applies on every map); it uses a distinct icon so it
is not confused with the eye.

- All, Available and Locked move hidden tasks into a collapsed "Hidden tasks (N)" section
  (`MapHiddenTasksSection` with `variant="list"`) whose Unhide all clears them.
- Completed and Failed list hidden tasks normally, as does any search, so every hidden task stays
  findable. A deep-linked task is never hidden (`getListHiddenTaskIds` in
  `app/features/tasks/hiddenTasks.ts`).
- The map shows exactly what the list shows: a hidden task draws no markers and leaves the
  completed-objectives notice count, except where the list shows it (search, Completed, Failed, a
  deep link). Hidden tasks leave the All, Available and Locked status and trader counts;
  Completed and Failed counts still include them (`useTaskCounts`).
- Needed Items drops the user's own objectives of hidden tasks from every tab and count until the
  task is completed; completed (not failed) hidden tasks stay on the Completed tab. Hiding is
  personal: a hidden task's objective stays while a teammate still needs it (the same pending
  teammates `NeededItem` shows, unless team items are hidden), so the team can still supply it.
  That objective is tagged `hiddenForSelf` and its card or row shows "Hidden for you" in place
  of the user's own count, progress and controls. Row and expanded card list the teammates; the
  compact card shows their count, and every style's tooltip (and screen-reader text) names who
  still needs it (`hiddenForSelfHint`). It adds nothing to tab counts, Group by item totals or
  Smart Fill targets (`countsForSelf`); Group by item shows only the user's own totals, so it
  leaves these needs out, and its "unique (total)" count uses `groupedNeedCount`. Hide owned
  ignores the user's own count for these needs, since a teammate still lacks the item.
  Hideout requirements and the dashboard's overall item progress are unaffected
  (`useNeededItems` `allItems`).

## Canonical task progression

### Server-side start requirements

`app/utils/taskOtherRequirements.ts` preserves and validates the API's `otherRequirements` at
adaptation and overlay boundaries. `app/stores/taskServerGates.ts` evaluates global-variable
comparisons literally, separately from prerequisite edges, and keeps missing or invalid effective
account values unknown (including `== 0`). Overlay `storyObjective` gates are met by the player's effective storyline objective
(a recorded mark or producer-declared tutorial baseline; see [storyline policy](./overlay-and-precompute.md))
(not by an in-game confirmation). A task that is available, started, completed or failed has passed its
start gates, so Mark available, Mark complete, Mark failed, the prerequisites Mark available
completes, and imported EFT starts, completions and failures all record that objective
(`recordImpliedStoryObjectives`). A task's recorded state proves its gates (`provesStartGates`) when
it is completed, manually failed, or confirmed available; automatic branch failures do not count
because they do not prove the task was started. The completed-task repair (`repairCompletedProgress`)
backfills ordinary tracked objectives for every gated task whose state proves it, on each progress and task-catalog
load, stamped past any unmark, so the two cannot disagree; it never unmarks. Repair and
the metadata projection never backfill a tutorial baseline or fabricate its completion time. Undoing Mark complete or
Mark failed releases only the objectives that action newly recorded, unless another task's state
still proves them; a manual uncomplete leaves them recorded. Completing or uncompleting an objective stamps a clock after the entry's
existing one, so a newer device clock cannot override the latest change. `applyOverlay` turns a story gate whose chapter or objective is absent from
the mode's story catalog into an unknown gate, and a recorded objective in one of the task's own
story-unlock chapters opens the story route, so Mark available backfills no prerequisites.
Trader conversations also require confirmation;
unsupported or malformed requirements remain blocked as `{ type: 'unknown', upstreamType }`, keeping the
upstream discriminator. Only published start requirements are
consumed, not finish/fail conditions. Unknown server gates remain in the locked list, with an
explanation shared by task cards and recommendations.

The [overlay registry](https://github.com/tarkovtracker-org/tarkov-data-overlay/blob/main/docs/GLOBAL_VARIABLES.md)
is a best-effort mapping from a global variable to the tasks whose completions derive it
([mechanics research](https://github.com/tarkovtracker-org/tarkov-data-overlay/blob/main/docs/GLOBAL_VARIABLE_MECHANICS.md)).
`app/server/utils/overlayCounters.ts` validates it against the overlay schema and, for the request's
mode, applies only `verified`/`complete` entries whose revision is in
`SUPPORTED_COUNTER_REVISIONS`. It attaches each entry's derivation to the matching gate as
`counter` when every contributor is in the same task payload: `{ type: 'distinctTaskCompletions',
taskIds }` counts each completed task, and `{ type: 'taskGroupCompletions', groups }` counts each
group the game credits as one. A list group counts once all its tasks are completed (same-threshold
Gunsmith pairs; whether half a group already counts is unverified, so the tracker takes the
conservative reading and Mark available covers an earlier in-game unlock). An `{ anyOf }` group (two
or more tasks) counts once any member is completed (faction variants such as the BEAR-only AKM and
USEC-only M4A1 Gunsmith parts, where a player can only ever complete one). No task may appear in two
groups. An unknown derivation
type makes the registry malformed, so the tracker must support a type before the overlay publishes
it. This runs last in `applyOverlay`, so task
corrections cannot supply a derivation.
`unresolved`/`partial` entries, unsupported revisions and other modes attach no counter.

Registry entries may also carry `pool: { traderId, loyaltyLevel }`. For a supported revision and
matching mode, the server attaches `taskPool` with that identity, verification, coverage and candidate
derivation when every contributor exists. This display metadata never creates a counter or an
additional trader-loyalty gate. Entries without pool metadata retain their existing counter behavior.
Both `counter` and `taskPool` are excluded from in-game confirmation signatures.

Cards and dashboard blockers share an instruction such as "Complete at least 3 LL2 tasks for
Mechanic". Cards show actual tracked progress and an expandable contributor list, with available
incomplete tasks first. Each contributor retains its own availability; the current task is identified
without being suggested as work to unlock itself. Faction alternatives appear together and earn one
credit per group. Confirmed in-game availability remains distinct from tracked completions.
Unresolved pools without an effective account value show "Progress unverified". A known account
value is displayed as in-game progress. Candidate tasks remain explicitly labeled, and counting
these candidates cannot clear the gate. Unmapped variables retain generic in-game progression wording.
Pool descriptions are additive to the existing `json-v3` task-core payload. Keep its cache keys:
payloads that retain the gate without pool metadata show a generic pool instruction until refreshed.
Payloads that previously discarded the gate cannot render it until a refreshed catalog restores it. Publish consumer
support before adding optional pool fields to the overlay, since older consumers reject unknown
registry entry fields; then refresh precompute and the existing browser/edge caches to expose names.

For a gate carrying `counter`, the evaluator counts that player's completed contributors or
groups (`task_counter` blocker with current/required on a shortfall). An account without those
completions reads a known shortfall, not unknown. An explicit effective account value takes
precedence, and an invalid one stays unknown instead of falling back. Gates without a derivation keep
the unknown behaviour below. The tracker never assumes other missing values are zero, creates
synthetic prerequisite edges, or shares a value between accounts/modes.

**Mark available** confirms the selected task's supported server-side start gates from the player's
in-game observation. Confirmations live in each mode's `taskAvailability` map
(`{ [taskId]: { requirements, timestamp } }`, `app/utils/taskAvailabilityConfirmation.ts`), never in
`taskCompletions`: confirming or clearing cannot create an "active" task record or rewrite a status
another device set. `requirements` is the exact normalized gate signature (the `counter` derivation is
excluded from it), and a clear is an empty string kept as a tombstone. Sync merges the map per task by
the confirmation's own timestamp. A confirmation counts only while its signature matches and it is
not older than the task's status timestamp, so a later reset, completion, failure or progress repair
on any device retires it without rewriting the map. The row sanitizer preserves the key (migration
`20260928140000_preserve_task_availability_confirmations.sql`); a missing key means no confirmations.
Every merge selects per-task timestamp winners before applying the
[map bounds](../../supabase/migrations/20261001190000_bound_task_availability_confirmations.sql),
so same-epoch writes cannot grow it past the sync payload limit or restore an older duplicate
when a newer winner is evicted.
Startup and reconnect merges compare against historical candidates before byte eviction; only the
bounded result is applied. Owned local snapshots carry field-valid candidates limited to 1,000
entries per mode through same-epoch composition. Their count bound is compositional: entries below
a source's first 1,000 cannot enter the union's first 1,000 when per-task timestamps only advance.
Snapshot candidates never enter applied state, serialization, or acknowledgement baselines.
Before replacing oversized owned active data, the retention guard preserves its unchanged bytes
in the existing owner-scoped recovery slot. Recovery saving may retain one unchanged historical
payload; it never synthesizes or accumulates new overflow. Saving identical validated owner bytes
is idempotent, including legacy progress fields that composition would otherwise normalize.
Divergent sources that cannot be
represented by one original leave both existing copies untouched and block destructive writes.
The matching owner may still reconcile those copies. A confirmed startup merge/upload releases
the historical barrier, and the existing acknowledgement flow retires the recovery copy.
The sync RPC unions confirmations, so omitting an evicted newer winner alone could restore an older
server value. Same-epoch startup reconciliation first uploads an eviction pass using the existing
empty-requirement clear tombstones, then the final bounded state. Each pass stays field-, count-,
byte-, and RPC-payload-bounded; no raw candidates are sent. Eviction clears use the largest known
local/remote confirmation clock, so they cannot replace a concurrent newer confirmation. A failed
or superseded pass leaves original recovery evidence pending. The server may retain bounded clear
tombstones in addition to the client's selected confirmations; they never count as availability.
Quota or storage failures preserve the originals and surface the existing failed-save warning.
Standalone backup imports still sanitize and bound each imported map. Task-ID tie ordering follows
PostgreSQL's C collation, including supplementary Unicode code points; NUL and lone surrogates are
rejected before they can prevent JSONB persistence.
It does not set a counter, acknowledge another task's dialogue, or complete candidate contributor
tasks. Because a derived count is an estimate, a confirmation overrides a derived shortfall. It cannot
bypass an explicit known unmet account value, malformed requirements, or independent
level/faction/trader/prestige/quest gates, and changed requirements invalidate it. The lock-reset button in
the card's Requirements header clears just the in-game confirmation. Mark available either makes the task available or changes
nothing: it is withheld for unsupported or malformed server gates and for unmet ambiguous-status or
malformed prerequisites. A confirmation-only mode counts as progress for sync and startup adoption. Status changes are stamped after the task's confirmation clock, so a
device whose clock runs ahead cannot keep a confirmation alive past a later reset. Clocks are
capped at 3000-01-01 (`MAX_CONFIRMATION_TIMESTAMP`, same bound in the migration); a confirmation at
the cap never counts. Mark available is offered only while every current blocker is one it can
clear (player level, trader level/reputation, unambiguous prerequisites, unknown-value or
conversation server gates) and never before the player's own evaluation exists (for example while
the player's own progress is hidden). An imported EFT
log start confirms the task's current gate signature, since the game only starts a task whose gates
are met. Shared profiles evaluate with the owner's confirmations. Incomplete/reset records are not
confirmation evidence. Explicit prerequisite backfill
continues for unambiguous completed/failed requirements; active-or-complete and other ambiguous
status choices no longer fabricate completion histories or flatten alternative ancestors.

This is additive to `tasks-core-json-v3`: old cached payloads that discarded `otherRequirements`
cannot be repaired in the evaluator. Before claiming the fix is live, verify a successful full
precompute refresh using this revision and refreshed edge/browser task payloads containing the new
field. No production precompute or cache purge is performed by opening the PR. Unknown gates that
are not published upstream cannot be reconstructed from the public task catalog.

Hideout cards evaluate the declared trader comparison against current loyalty (legacy default `>=`). Completed-module enforcement retains a build if the current stored loyalty satisfies the comparison (including legacy values above the normal range), or if any valid loyalty level at or below it satisfies that comparison, so advancing past an upper-bound or equality requirement cannot erase built modules or their parts. Lower-bound loyalty downgrades still revoke dependent builds. Disabled trader gating bypasses both checks. Optional profile chapter and prestige normalization run inside their optional request boundaries: malformed catalogs show a partial failure without discarding successful task catalogs. Overlay promotion requires a nonempty editions catalog as well as complete provenance, and forced edition refreshes forward `cacheBust=1` to bypass the worker overlay cache.

Isolated profile catalogs normalize and qualify duplicate objective IDs and build the same task predecessor graph as active metadata, without mutating active progress. EFT completion imports apply trader implications only when the trader-gating preference captured at confirmation is enabled; task completion and player-level implications remain authoritative. Shared profiles project legacy objective keys through the duplicate-ID mapping without modifying stored progress; explicit task-qualified values take precedence.

`app/utils/taskRequirements.ts` normalizes the discriminated trader collection at the server
boundary. `tarkov-json.ts` builds `normalizedTraderRequirements` after reference adaptation;
`overlay.ts` rebuilds it when an overlay replaces trader requirements. Legacy split lists remain
compatibility projections. Missing types, malformed references/values and unsupported comparisons
become diagnostic unknown requirements, not reputation guesses. A missing comparison on a known
legacy requirement defaults to `>=`. Declared `>=`, `>`, `<=`, `<`, `=`, `==` and `!=` are evaluated
literally. Neither trader identity nor the sign of a value selects its meaning.

Declared prerequisite collections and prestige references follow the same rule. `null` and
`undefined` mean the optional gate is absent; every other value is a gate the source declared, so it
either survives normalization or is recorded in `Task.requirementDiagnostics` as `task_requirement`
or `prestige_reference`. `tarkov-json.ts` models `requiredPrestige` as an id reference only, so it
drops anything else and records the diagnostic; `overlay.ts` reports exactly the gates its own
normalization dropped; `taskAvailability.ts` turns each diagnostic into an unknown blocker. Supported
source shapes are unaffected: a bare prerequisite task id, a bare prestige id string, and a prestige
object reference all still resolve, an absent or empty collection still leaves the task available,
and the overlay keeps the id-less `{ name, prestigeLevel }` gate of an injected New Beginning task
verbatim (its level comes from `buildPrestigeTaskMap`'s task id/wikiLink inference, not from the
reference). A satisfied story route continues to unlock a task whose quest group is uninterpretable,
because that route is an alternative to the group rather than a bypass of an independent gate. The
evaluator additionally treats a non-list `taskRequirements` as the same diagnostic rather than as an
empty list, so an older payload cannot make availability read a broken collection as no collection.
That guard covers the evaluator only: other task consumers still assume a list, and a pre-fix payload
that dropped a gate without recording a diagnostic stays unlocked until the refresh below replaces it.

A `prestige_reference` diagnostic blocks independently of `prestigeTaskMap`, including entries
inferred from a New Beginning task id or wikiLink: inference cannot repair a malformed declared gate.
Without a diagnostic, the map continues to govern supported prestige references and inferred tasks.
The overlay's supported id-less prestige shape is retained without a diagnostic. Two adjacent paths keep
the diagnostic intact rather than losing it: task patches are normalized using their original id,
and retain pre-merge diagnostics rather than accepting a patch-supplied diagnostic array,
including locale patches after they merge,
because locale corrections are applied last, and `useProfileTaskMetadata.mergeProfileTasks` takes only
objective data from the objectives catalog, so a stray gate field an overlay patch merged into that
response cannot replace the core catalog's gates.

`app/stores/taskAvailability.ts` evaluates each task/user with memoization and cycle protection.
The result carries availability and blockers for levels, loyalty, reputation, quest statuses,
failed branches, faction, trader unlocks, prestige and unsupported data. `useProgress.taskEvaluations`
is the source for explanations and sorting; `unlockedTasks` is its boolean projection. The task
card builds one requirement list with `useTaskRequirements`: while a card is locked, its header
lists only the unmet requirements as chips (three, then an inline "+N more"), and the expanded body
has a collapsible Requirements row that marks every level, trader, prerequisite and server-side
(`otherRequirements`) requirement met or unmet. Cards carry no separate level or trader requirement badges. Comparisons are worded in
plain language by `requirement-format.ts` (`15+`, `exactly 1`, never `>=`); the dashboard's
`useTaskBlockerText` sentences use the same formatter. Shared/non-current profile
views call the same evaluator with their own mode progress. Profile task/objective, prestige and
story catalogs load for the selected mode without mutating the active metadata store; obsolete
mode/language requests are aborted on scope change or unmount and late responses are ignored.
Requests time out after 60 seconds to accommodate the server retry budget. Edition and story
catalogs share one request but validate independently; story, edition or prestige failures retain
successful task and objective data with an error indicator. Profiles prefer the selected mode's
editions, falling back to the active catalog while unavailable. Missing core/objective catalogs
remain fatal.
Explicit objective `unlocks` with `type: 'trader'` supply trader gates shared by dashboard cards
and every pending task owned by that trader, including tasks without their own story requirements.
Only a unique objective placement is authoritative; an omitted trader ID resolves only through a
unique same-name chapter trader reference. Chapter summaries and objective wording never imply a
gate. Exact objective completion (including the producer-declared tutorial baseline) opens the
trader; chapter completion, standing, other completed tasks, task availability confirmations and
disabled loyalty gating do not bypass an explicit gate. Catalogs must match each user's mode;
shared profiles use their isolated viewed-mode catalog. Dashboard task-derived story gates remain
a compatibility fallback when no clear objective placement exists. Story trader blockers name the
objective and cannot be cleared through Mark available; complete the storyline objective first.
Task-gated traders open when any configured unlock task (`TRADER_UNLOCK_TASKS`) or any task whose
`finishRewards.traderUnlock` names the trader is complete (for example, Mechanic's Introduction
opens Jaeger). The dashboard and the evaluator read the same reward-derived list, so a trader
locked on the dashboard also locks its tasks.

Dashboard Up next follow-up counts use canonical prerequisite availability intersected with the
current profile's edition, prestige and faction eligibility. Ineligible children contribute no
“Opens” count or ranking bonus. Dashboard display preferences (task categories and required keys)
do not remove an otherwise eligible follow-up from that count.

Completed and failed tasks are terminal.
The existing acceptance-unknown interpretation is retained; this does not introduce #715's
explicit Accept workflow.

Shared story chapters followed by matching mode corrections produce `Task.storyUnlocks` from
`questUnlocks`. Availability requires all independent gates AND (all quest requirements OR any
wired chapter with recorded completion/objective progress). Chapter ordering is never an unlock
condition. Client chapters merge the same mode patches (including partial objectives), and
edition/chapter caches and in-flight requests are mode-scoped. The Requirements row lists a
story route as its own "Or progress a story chapter" line, met from the same effective story
progress the evaluator reads; the quest prerequisites keep their own state. `complete|failed` accepts either terminal outcome. A story route cannot bypass trader,
faction or prestige gates. Required prestige uses the existing authoritative prestige task map;
unresolved references remain blocked until metadata is available.

Sorting lives in `app/utils/taskSorter.ts`. Progression sorts available tasks first, then a single
numeric gate by relative distance, a quest-chain gate, multiple gates, completed tasks, terminal
blocked tasks, and unknown data. All-users views use the best visible user's rank. Trader sort
uses trader order, that trader's required loyalty, readiness, and stable name/ID ties. Pinned
partitions and map/status grouping remain intact. Item distribution retains Kappa priority and
uses progression within it; Kappa chain groups use progression while keeping parts adjacent.
The row sorter accepts a partial progression index: chains inherit their best known rank, and
wholly unranked groups sort last. Catalog changes recompute the overview reactively; removed
tasks are not retained as stale rows.
The existing impact default remains. Saved `level` values retain player-level sorting, now labelled
Player level; `progression` is additive and invalid saved/query values retain the `none` fallback.
Genuine level badges, graph levels and XP/level projections remain player-level values.

Completion/availability actions and EFT completion imports share `taskProgress.ts` implications:
raise known loyalty/reputation lower bounds without reducing earned values. Integer strict loyalty
bounds advance to the next level; strict reputation bounds remain unchanged because no exact
standing increment is known. Upper bounds and `!=` do not infer a new minimum. Existing terminal
prerequisite outcomes are preserved. EFT completion logs do not identify which OR route was used,
so tasks with wired story alternatives do not imply completion or failure of legacy prerequisites.
Explicit prerequisite events still apply. Missing recorded story progress is not proof of the quest
route. Imports load and mutate only their selected destination mode;
Seasonal log eligibility and restoration guards are unchanged. Tarkov.dev profile import does
not import quest completions and therefore has no trader/task backfill path.

### Invariants

- Canonical requirements, blockers, status comparisons and story alternatives are shared by UI and
  recommendations; no new dependency on the removed upstream task `alternatives` is introduced.
- Known trader gates may be disabled by preference; unknown data never silently unlocks a task.
- A declared gate that cannot be interpreted never reads as an absent gate. An absent optional gate
  leaves the task available; a malformed explicit prerequisite collection or prestige reference keeps
  it blocked behind an unknown blocker.
- `requirementDiagnostics` is additive to the `tasks-core-json-v3` contract, so recording it does not
  bump the precompute or browser cache versions and adds no new rollout requirement. A payload
  without the field behaves exactly as it did before; the evaluator
  independently blocks a non-list `taskRequirements` from any payload vintage. Successful precompute
  refreshes run every 12 hours, after which edge and browser caches must also refresh. This is not
  a strict 12-hour recovery bound: failed runs can leave older KV entries serving for their seven-day
  TTL. Verify a successful precompute from the deployed fix before claiming production diagnostics
  are active; already-discarded gates cannot be recovered by the evaluator alone.
- PvP, PvE and Seasonal evaluate only their own progress and mode-specific task metadata.
- Task-core stays on `json-v3` for optional pool descriptions; player progress and IndexedDB schema
  8 are unchanged. Deploy the compatible consumer with the current overlay first. After publishing
  pool metadata, run trusted-main precompute without language/mode filters and verify all 48
  refreshed entries and their overlay provenance before purging corrected edge/browser metadata.
  This avoids exposing empty versioned KV keys during Pages' automatic deployment. Incompatible
  contract changes still require the separate compatible-producer/preseed/consumer rollout in
  [overlay release verification](./overlay-and-precompute.md#release-verification).

## Map objective visibility and required items

**Summary.** The Tasks map derives objective visibility once for map markers and the required-item
summary. Objectives are categorized as pinned, self, or team, while the summary separately groups
items and keys from pinned tasks and active tasks so pinned requirements remain distinguishable.

### Flow

1. `useMapObjectiveMarks` derives each objective's active users, completion state, and category.
   Pinning is resolved from the enclosing task ID; pinned objectives take precedence over self and
   team membership. The composable returns both map marks and an objective-visibility map, each
   entry carrying the category plus `selfNeedsObjective` — whether the local player still needs
   that objective themselves. Under the Locked and All status filters, `tasks.vue` passes
   `shouldShowLockedObjectives`, so objectives of locked (not failed) tasks with no other owner
   draw as self markers; a teammate who needs the objective still owns it.
2. `LeafletMap` applies the pinned, self, and team map preferences to marker colors and visibility.
3. `MapRequiredItemsSummary` splits the selected task set using the persisted pinned task IDs, then
   aggregates bring-mode equipment and alternative key groups independently for each group. It
   filters objectives to the selected map and the shared objective-visibility state.
4. The summary's pinned group follows the pinned-objective preference. Its active group follows the
   self-objective preference. Objectives the player does not still need themselves are dropped, so
   the Team chip never changes required-item summaries.
5. Quests the user hid from the map (#918) are applied last. `useMapObjectiveMarks` returns
   `mapTaskIds` (tasks that draw at least one marker in an enabled pinned/self/team category on the
   selected map, before hiding) and `hiddenTaskIds`; objectives of hidden tasks are removed from
   both the marks and the objective-visibility map, so the required-items summary follows too.
   `MapTaskVisibilityPanel` (inline and fullscreen), the task-card toggles, and the marker popup
   (via `LeafletMap`'s `taskVisibilityActions`) edit the single `mapHiddenTaskIds` list. In map view
   `tasks.vue` moves hidden map quests out of the main list into the collapsed
   `MapHiddenTasksSection`, so the list matches the map.

### Files

- `app/composables/useMapObjectiveMarks.ts` — objective users, categories, map marks, and shared
  visibility state.
- `app/features/maps/LeafletMap.vue` — marker category filtering and map rendering.
- `app/features/maps/utils/objectiveHitTest.ts` and `LeafletObjectiveStack.vue` — stacked
  objective hover list.
- `app/features/maps/MapRequiredItemsSummary.vue` — pinned/active grouping and preference gates.
- `app/features/maps/composables/useMapRequiredItems.ts` — selected-map item/key aggregation.
- `app/features/tasks/task-objective-equipment.ts` — canonical bring-mode equipment extraction.
- `app/pages/tasks.vue` — passes filtered tasks and shared visibility into the map components.
- `app/features/maps/utils/mapTaskVisibility.ts` — hidden-quest helpers and popup action type.
- `app/features/maps/MapTaskVisibilityPanel.vue` and `app/features/tasks/TaskMapVisibilityToggles.vue`
  — hide / "show only" controls above the map and on task cards (via `mapTaskVisibilityKey`).
- `app/features/tasks/MapHiddenTasksSection.vue` — collapsed list section for hidden map quests.

### Invariants

- Pinning is determined by `task.id`, never by an objective ID; a pinned task's objectives are
  categorized as `pinned` before self or team membership is considered.
- Map marker visibility is controlled independently by the pinned, self, and team preferences.
- Required-item summaries use the selected map and shared objective visibility, exclude completed
  objectives, and preserve equipment counts and alternative key groups after deduplication.
- A summary lists only what the local player still needs, and enforces that through
  `selfNeedsObjective` rather than through `category`. That covers objectives the player ticked
  off, tasks they completed or failed, and tasks they have not unlocked — even when a teammate
  still needs the objective. Gating on `category` alone would be wrong, because a pinned task
  reports `category: 'pinned'` and would otherwise mask a teammate-only requirement.
- Pinned and active task requirements are aggregated into separate groups whenever both contain
  visible content; the pinned group uses the pinned marker accent.
- The pinned summary group follows `mapShowPinnedObjectives`; the active summary group follows
  `mapShowSelfObjectives`. `mapShowTeamObjectives` does not hide or alter the required-item
  summary, preserving the product rule that the Team chip controls map markers only.
- Bring-mode aggregation additionally includes the canonical `objective.item` field for bring-type
  objectives, covering upstream objectives that expose no `items` array. Task-card rendering uses
  `all` mode and is unaffected by that field, and neither mode reintroduces the removed task
  `alternatives` runtime dependency.
- A group given a title renders its section headings one level down (`h4`) and uses the short
  `required_items` / `required_keys` labels; an untitled standalone group keeps the `h3` level and
  the longer `*_summary` labels.
- Hiding a quest is a separate state from filter-driven visibility (task filters, trader-standing
  gating from #730): it only acts on tasks that already passed every filter. In map view a hidden
  map quest leaves the main task list for the collapsed hidden section, but it is never dropped from
  the filtered set; the task opened from a link stays in its own section.
- There is one state, a hidden list keyed by task ID. "Show only" hides every other quest in the
  current map's `mapTaskIds` and un-hides the chosen one; quests unlocked later are shown by
  default. "Show all" un-hides the current map's quests only.
- `mapHiddenTaskIds` persists in user-scoped local preferences storage and is not part of the
  Supabase `user_preferences` sync payload (no column exists).
- Jumping to an objective of a hidden quest un-hides that quest first so its popup can open.
- Hovering or clicking an objective marker hit-tests every visible zone and point in container
  pixels. When more than one distinct objective is under the pointer, the popup is a compact stacked
  list (points first, then zones smallest to largest); choosing an entry pins that objective's full
  tooltip. A zone and its own center marker count as one objective, so a single objective still gets
  the full tooltip directly (#919).

## Task list and Needed Items

### Task list loading

`app/composables/useInfiniteScroll.ts` loads another batch only when the sentinel is connected
to the document and has a layout box. Nuxt Suspense can mount a warm-cache task list in a
detached tree; its zero bounding rectangle must not trigger auto-fill. Hidden or detached
sentinels consume no auto-load budget. The existing intersection observer checks again when
the list becomes visible; configured scroll fallback and explicit checks use the same guard.

The tasks page requests objectives, rewards, item-lite hydration, and edition eligibility through the
readiness composable `useTaskDetailReadiness`, which invokes the existing cached/deduplicated
metadata store actions. Keep its loading state
until these requests, background edition revalidation, objective mode-count metadata, and the
first visible-task refresh settle. This prevents objective
skeleton/reward reflow and an initial list filtered without edition eligibility. This eager
request is scoped to the tasks page; other routes retain the store's idle scheduling. Edition
responses, errors, and cleanup apply only to the current promise; superseded cache reads and
network requests cannot overwrite current eligibility, cache payloads, or loading state.
Normalize edition and chapter network payloads before applying either, preserving existing
data if normalization fails. Empty cached editions do not replace loaded eligibility.

Task readiness uses `ensureEditionsData` to join or reuse the current mode/language edition request,
including a request settled during bootstrap/core loading. Settled failures are also reused to avoid
repeated readiness requests; they retain the error, and explicit fetch/refresh calls retry. Scope
changes invalidate that settlement and clear the visible catalog. Explicit `fetchEditionsData` calls keep
their cache revalidation behavior. Queued reward work, like editions, is consumed by a later eager
request; other routes retain their idle load when no caller takes ownership.

Initialization marks `tasksCoreRefreshing` before updating locale/mode and reading caches.
`fetchAllData` registers its phase synchronously before bootstrap; initialization then releases
its setup phase. A per-store set retains every active phase until core settlement, including
failures, so either completion order keeps readiness pending while another core refresh can run.
Task readiness stays false during this phase, so locale changes cannot reveal old core data
while bootstrap is pending. Optional requests remain outside this phase and keep their timeout.

Deferred edition callbacks capture a request version. A later edition request, including a
deduplicated join, consumes that queued load; the callback skips its redundant revalidation.
Routes without an eager request retain idle edition loading.

Core-task replacements advance `tasksCoreRevision`, including cache hits that never raise
`loading`; detail/item merges do not advance it. Readiness watches this revision so cached
locale replacements and empty-to-populated core recovery start a new wait. After objectives
and rewards/items settle, await objective mode-count metadata; retry once only when the store
returns `stale` for a response discarded during task replacement. Handled failures are not retried. The existing gate timer still bounds this wait.

Optional detail requests use a three-second gate timer after core readiness; on expiry,
resume filtering/rendering while late requests continue. Failed requests also release
the gate. Mode/locale changes, core reloads, and scope disposal invalidate earlier waits and clear
their timers. An empty task dataset does not wait for optional requests.

Reset filter readiness when metadata or task-detail readiness resets. Metadata readiness
alone must not expose the empty state during the debounced filter refresh; a completed refresh
with no matching tasks still shows the normal empty state. Subsequent filter changes retain
the existing debounce and task actions still request an immediate refresh. Deep-link effects
use this combined loading state so queries wait for mounted cards and retry after readiness
clears even when the filtered task IDs have not changed.

Keep the tasks page's eight-card batches, preload margin, and auto-load caps. Do not defer
critical metadata or change task filters, progress state, or card expansion to mask mounting
cost. The #808/#444 performance validation is historical and archived in git history; keep the
behavioral invariants above (eight-card batches, preload margin, and auto-load caps) unchanged.

### Task card layout and legacy density preferences

Task cards always use compact spacing. There is no density selector or persisted density
preference. Hydration discards legacy `taskCardDensity` values, including comfortable; remote
`task_card_density` values are ignored and new preference writes omit that column. Keep the
database column for older clients; this UI change requires no column removal or data rewrite.

Collapse-by-default and hide-rewards remain independent preferences, both off by default.
Collapse-by-default applies to list cards; map cards start expanded. Matching deep links expand
their card. The dedicated chevron controls card expansion in both views. Hide-rewards applies
to both list and map cards. Missing database columns use the existing preference-sync fallback,
so new settings remain local until the compact-list preference migration is deployed.

### Needed Items pooled objective search and grouping

Pooled "any of these" task objectives (`NeededItemTaskObjective.acceptedItems` with more than one
entry) have two identities on the Needed Items page, and they must not be conflated. Progress and
counts are always keyed to the objective itself (`id` for `getObjectiveCount`, the primary item for
legacy grouping); the visible item identity is display-only. The list and grid views rotate or pin
the displayed item, the "Any of N" popover marks pool membership, and the combined view aggregates
counts per displayed item.

Search must match any accepted item's name or short name, not just the primary item, so a valid
turn-in item like Augmentin surfaces quests such as Pets Won't Need It. While such a match is
active, the combined view re-keys the pooled objective under the matched accepted item (identified
by name or short name) and registers it in `objectivesByItemId` under the same key; list and grid
views pin the display to the matched item. Without an accepted match, the primary item stays
canonical under the grouped-view rule that nameless items are not grouped. A pooled objective
contributes to at most one group, so search-time re-keying never double-counts. When the matched
item already has direct needs (needs whose own primary item is that item), re-keyed pooled
objectives are dropped from the combined view instead of joining that group, so the searched
item's displayed total stays aligned with its visible direct needs (#882: a LEDX search otherwise
added every "sell N of any item" pool). Progress writes stay bound to the objective ID regardless
of which item identity is displayed.

The grouped card total uses `filteredItems`, including the ownership filter. Its modal target list
uses the same view filters except ownership, so owned direct needs can remain editable and resettable
even when hidden from the card total. Resolve the modal's accepted-item suppression against the
visible `filteredItems` set; recalculating it over the expanded modal targets can incorrectly hide a
pooled objective that the card displays. Snapshot modal targets and collected totals when the modal
opens, and close it if the active game mode changes. Mutations must be guarded against writing the
snapshot into a different mode's progress profile.

Keep `findAcceptedItemMatchIndex` (search filter and display pin) and the grouped-view accepted
match aligned: if one matches by name-or-short-name and the other does not, the grouped view shows
a pooled objective under a different item than the list pins, which contradicts the searched
identity.

### Needed Items priority ordering

In descending priority order, active tasks rank above buildable hideout modules, followed by
available tasks and all other needs. A hideout module is buildable only when it is the station's
next level and its station, skill, and trader prerequisites pass under the user's corresponding
requirement settings. Grouped-by-item sorting and smart-fill distribution keep their own behavior.
