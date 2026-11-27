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
tasks left and their counts), `/tasks/maps` one map and `/tasks/graph` the trader graph. The Maps
view widens past the other views on large screens (`xl` and `2xl`) so the map gets the room. Its
map picker (`TaskFilterBar.vue`) wraps every map and its count onto as many rows as needed from
`sm` up; below `sm` it stays one scrolling row and scrolls the selected map into view. The selected
map and trader use the accent fill and border (`getPickerTabClass` in `app/utils/statusTones.ts`),
and the selected map also shows a marker icon. Tabs in the
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

## Quest links

The Quest links chip works on both collapsed and expanded cards. Hover over it, or activate it
with a click, tap, or keyboard, to see links to named quests in the selected mode. It groups mutual
choices, quests that fail when this one is completed, and quests whose completion fails this one.
It also shows follow-up quests and previous quests according to the corresponding card settings.
Previous quests already linked in the visible Requirements are omitted from the popover.
Downstream impact appears inside Quest links when a relationship is listed, or in the header when
there is impact without a visible relationship.

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

`app/utils/taskOtherRequirements.ts` preserves published start gates. `app/stores/taskServerGates.ts`
evaluates global-variable comparisons literally, separately from quest edges. Missing or malformed
values stay unknown, including for `== 0`. Unknown gates stay locked and share explanations
across cards and recommendations. Finish/fail conditions do not become start gates.

Story gates use recorded objectives or the producer's tutorial baseline. Missing mode-scoped
chapters/objectives become unknown. Mark available, complete, fail, implied prerequisite
completion and EFT imports record the relevant story objective. A completed, manually failed
or confirmed-available task proves its gates. Automatic branch failure does not. Repair
backfills ordinary objectives after the latest unmark without fabricating baseline timestamps.
Undo releases only the objectives that action introduced unless another task still proves
them. Manual uncomplete keeps them. All mark/unmark writes advance the objective clock.

`app/server/utils/overlayCounters.ts` applies the
[global-variable registry](https://github.com/tarkovtracker-org/tarkov-data-overlay/blob/main/docs/GLOBAL_VARIABLES.md)
last. A counter requires verified, complete, supported-revision mode data and every contributor
in the task payload. Distinct tasks count individually. Groups count once for all members, or
once for any member of an explicit `anyOf` group. A task cannot belong to multiple groups.
Unresolved, partial, wrong-mode and unsupported entries create no counter. Unknown registry
shapes fail validation. An explicit valid account value wins; an invalid value stays unknown.
A recognized derived count with no completions is a known shortfall.

Optional pool metadata explains trader/loyalty candidates without inventing a counter or
loyalty gate. Pool labels and contributor lists distinguish tracked progress, in-game values
and unverified candidates. Available unfinished contributors rank first; the task itself is
never suggested as its own unlock. Counter/pool metadata is excluded from the confirmation
signature. Deploy compatible consumers before publishing new optional registry fields.

### Availability confirmations

`app/utils/taskAvailabilityConfirmation.ts` stores per-mode `taskAvailability[taskId]` with the
normalized gate signature and timestamp. A clear uses an empty-signature tombstone.
Confirmation never changes a task status and is invalid if older than the current status or
if the signature changed. Status changes advance beyond confirmation clocks. Clocks cap at
3000-01-01; a confirmation at the cap never counts. Confirmation-only progress is syncable.

Mark available is shown only for the player's own evaluation and when its supported changes
can clear every blocker. It can confirm unknown/conversation gates, override a derived
shortfall, and backfill unambiguous level/trader/quest requirements. It cannot clear explicit
unmet values, malformed gates, faction/prestige gates, unknown task data or independent story
trader gates. Ambiguous prerequisite statuses never manufacture outcomes. An already open
story route does not backfill quests. EFT starts confirm the current gate signature. Shared
profiles use their owner's confirmations. Clearing affects only that confirmation.

Select same-epoch winners by task timestamp before count/byte eviction. Historical snapshot
candidates are field-valid and capped at 1,000 per mode. They never enter applied state,
serialization or acknowledgement. Preserve one original oversized owned payload in its recovery
slot, idempotently. If divergent sources cannot fit that rule, keep both originals and block
destructive writes until owned reconciliation. Send bounded eviction tombstones before the
final bounded map, using the highest known local/remote clocks so newer concurrent records win.
Failed or superseded reconciliation leaves recovery pending. Reject NUL and lone surrogates;
task-ID ties follow PostgreSQL C/code-point order. Standalone imports sanitize and bound maps.

### Trader, story and prestige gates

`app/utils/taskRequirements.ts` normalizes trader loyalty and reputation comparisons. Apply
declared operators literally and default a missing legacy operator to `>=`. Preserve upstream
type and record unknown diagnostics for malformed explicit task, trader or prestige gates.
Only absent optional inputs omit a gate. Overlay and localized patches retain original IDs
and diagnostics. An objectives-only merge cannot replace core gates. A malformed prestige
diagnostic blocks independently of inference. The overlay's supported id-less New Beginning
gate uses the authoritative prestige task map.

`app/stores/taskAvailability.ts` memoizes per-task/user evaluations with cycle protection.
`useProgress.taskEvaluations` drives locked cards, sorting and recommendations. Known trader
gates can be disabled; unknown data stays locked. Required status `complete|failed` accepts
either terminal outcome. A story route permits **independent gates AND (quest prerequisites
OR recorded progress in an explicitly wired chapter)**. Chapter order never grants access.
For Preserve a Valuable Piece, eligibility alone does not prove Cut Down to the Root was
accepted. An imported EFT start or explicit in-game availability confirmation is required;
a reset invalidates the confirmation even when the reset device runs behind. A terminal Jaeger
status closes the route. The five-second game delay is informational because the tracker does
not have an authoritative acceptance clock.
Other active prerequisites retain their existing planning behavior.

Eligibility and caches use the selected mode. An isolated profile uses its own metadata and
progress and ignores superseded requests. Required core/objective failures are fatal;
edition, prestige and story failures can stay partial. Edition/story validation is independent.
Profile objective normalization keeps task-qualified IDs authoritative without writes.

Explicit story-objective trader unlocks apply to all tasks for that trader. Resolve only a
unique objective placement and a unique same-name chapter trader when no ID is supplied.
Exact objective completion or the tutorial baseline opens it. Chapter summaries, standing,
task completion and disabling loyalty do not. When no clear story placement exists, the dashboard and evaluator share configured and
reward-derived unlock tasks. Any completed unlock task opens that trader. It never gates itself. A configured but missing task stays a gate
that recorded progress or [EFT import](imports.md#eft-log-import) may satisfy. Ref uses only
the current mode's ID. Missing catalog data explains a blocker without exposing a raw ID.

Completion/availability and EFT completion share trader lower-bound implications. Never
reduce loyalty/reputation or infer upper-bound, inequality or strict reputation increments.
Strict integer loyalty advances one level. A built hideout module stays built when current
or a lower valid loyalty satisfies an equality/upper-bound gate. Lower-bound downgrades can
revoke a build. Disabled trader gating bypasses both checks. EFT trader implications honor
the preference captured at confirmation. Quest completion and level implications still apply.
EFT cannot infer the quest branch from a completion with a story alternative. Tarkov.dev
profile import has no quest-completion backfill.

### Presentation and ordering

Cards show a short collapsed blocker list and shared requirement explanations. Expanded rows
put blockers first and group equivalent trader gates. Show story routes as independent
alternatives. Time-gate notes display finite positive upstream min/max delay for unfinished
tasks, with no countdown or effect on sorting, availability, or Mark available.

`app/utils/taskSorter.ts` progression sorts available, single numeric gate by distance,
quest-chain gate, multiple gates, completed, terminal-blocked and unknown. All-users views use
the best visible rank. Trader sorting uses trader/loyalty/readiness then stable name/ID.
Pinned partitions, map/status groups and Kappa chains stay intact. Partial-rank chains take
their best rank and unranked groups go last. Impact remains the default. Legacy `level`
means player-level sort and invalid settings fall back to `none`.

Up next counts only eligible follow-ups across edition, prestige and faction regardless of
dashboard display settings. It can suggest one incomplete started or auto-started Storyline
chapter, skip optional/tutorial progress, and leave unresolved route choices to the player.
Missing objective data asks the player to review the chapter. “Opens” counts eligible pending
tasks whose only remaining gate is the exact objective. The unfiltered personal Available
empty state reuses this guidance. Known story blockers deep-link to their objective.

### Invariants

- PvP/PvE/Seasonal never borrow other modes' metadata or progress. No new runtime dependency
  on the removed upstream `alternatives` field.
- Requirement diagnostics, server gates, pool labels and delay fields remain additive to
  `tasks-core-json-v3`. Older payloads that dropped source gates require successful precompute
  and edge/browser refresh. Twelve-hour scheduling is not a recovery deadline. Failed writes
  can leave old KV entries up to their seven-day TTL.
- Deploy the compatible consumer first. After publishing pool data use unfiltered trusted-main
  precompute and verify all 48 entries and provenance before cache invalidation.
  See [overlay release verification](overlay-and-precompute.md#release-verification) for
  incompatible producer/preseed/consumer ordering.

## Map transit layer

The map's independent **Transit** layer shows transit locations from the active mode's
`json.tarkov.dev` map payload. It defaults on and the toggle appears only when the selected
map has transit coordinates. Labels use upstream localized descriptions (with the existing
English fallback), the transit glyph, and a dashed border; the marker color is configurable
alongside the extract and spawn colors. Extract and spawn toggles do not affect transits.
Extract and transit labels remain visible across floors. Elevation arrows point toward the
marker from the selected floor as a single badge (the level count is added beyond one level); no
badge is shown for unknown
height or a volume spanning the selected floor. Transit conditions are not displayed;
this layer identifies locations, not whether a particular player can use them in a raid.
No overlay additions or additional upstream requests are required.

`app/features/maps/LeafletMap.vue` renders the layer and `useLeafletMapControls` derives its
visibility. `app/composables/useLeafletMap.ts` owns layer creation and cleanup.

## Map location accuracy and elevation

`mapLocations.ts` rejects missing/non-finite horizontal positions for extracts and transits
before layer availability and rendering. Ground Zero also checks its render bounds: upstream
`regular`, `pve`, and `pvp-season` catalogs checked on 2026-11-10 incorrectly included UN Roadblock,
Scav Bunker (Woods), and Pinewood Basement (Streets). Their coordinates are not repaired or moved.
Transits belong to their containing source map; their `map` field identifies the destination.
Other maps retain edge extracts outside artwork bounds. Existing cached catalogs receive the
same presentation validation, without waiting for a server cache refresh.

`app/data/mapFloors.json` contains reviewed height ranges and spatial extents from
[the-hideout/tarkov-dev maps.json at a7cb849](https://github.com/the-hideout/tarkov-dev/blob/a7cb849a9c881bb1fa12ffb666c20e46aa5d1038/src/data/maps.json).
The `order` is lowest to highest **selectable** floor, independent of SVG stacking order.
Layer names map to our existing floor IDs (Labs `Second Level` becomes `Second_Level`).
Keep spatial bounds with the heights when refreshing this metadata: low outdoor Ground Zero
locations are not necessarily in Garage, and the showroom has a local second-floor exception.
Maps lacking reviewed floor metadata, including Terminal, show no inferred arrows.

Icebreaker uses the hosted floor tiles credited to TarkovBOT.eu and the deck heights from
[Tarkov.dev's Icebreaker map settings](https://github.com/the-hideout/tarkov-dev/blob/bc4ed844accb259a4ec07ed0077176fa91975908/src/data/maps.json#L1014).
The published transform projects the helicopter extract outside the raster. The local transform was
fitted to the zoom-2 tile artwork using Tarkov.dev's spawn, loot, and lock positions and checked
against the helipad and 42 held-out boss positions at their published deck heights. All 42 project
within 10 pixels of visible deck artwork at that zoom. Boss coordinates and configured chances
come from the catalog. The chance is per spawn entry, including entries whose in-raid conditions
are unspecified. The floor picker shows only the floors in the selected Main Decks or Engine Room
group. Switching groups selects Infirmary or Engine Room, and the selected floor drives the artwork
and pin elevation indicators. The groups follow [TarkovBOT's Icebreaker map](https://tarkovbot.eu/tools/interactive-maps/icebreaker).

The catalog fills empty boss position lists only when the map ID, boss role, and raw zone name
match a verified fallback. Tarkov.dev supplies the encounter rows, probabilities, and any
available positions.

On Icebreaker this covers Knight's Mash_t1 on Storage/Security and The Wedge's RoomsThird and
RoomsThirdKitchen on Gym/Canteen. The positions come from the game-data import's
unmodified bot spawn entries. All 12 project onto the visible artwork of their recorded decks.
[Retail import provenance](https://github.com/danauraborealis/ManimalIcebreaker/blob/4effee7c5d0efa1943aa250c29ef031fe24a7c03/analysis/remap_retail_spawns.py#L36-L40)
[Imported SpawnPointParams](https://github.com/danauraborealis/ManimalIcebreaker/blob/4effee7c5d0efa1943aa250c29ef031fe24a7c03/icebreaker-server/db/base.json#L1600-L3110)

The other fallbacks cover Reshala at Dorms and New Gas on Customs, Sanitar at Pier and the
Cultist Priest northeast of the Sunken Village on Shoreline, and the shared port spawn for
Reshala, Glukhar, Killa, Sanitar, and Tagilla on Terminal. The 34 positions match retail bot
spawn entries across game-mode captures. The pinned public archive corroborates their zone
IDs and horizontal coordinates. Shoreline uses the elevations from the newer captures.
[Retail location archive](https://github.com/carlsmei/tarkovdata/blob/08649f48a43fe8f4bea311b23a224a278a26492b/locations.json)

The Lab (Dark), Infected Lab and Infected Factory reuse the backgrounds that Tarkov.dev declares
for those variants. Each variant keeps its own boss rates, locations and extracts.

`mapElevation.ts` classifies points and vertical volumes using half-open height intervals and
scoped spatial exceptions before the base layer. A volume spanning several levels uses the
nearest supported level toward the selected floor; a selected floor within that span needs no
arrow. Task-zone positions and vertical bounds survive mark construction and participate in
mark hashes. Legacy two-dimensional GPS has unknown height, never a fabricated zero.
Extract/transit pins and task markers update floor badges on floor changes: a solid up/down arrow,
plus the level count when it is more than one, with translated accessible descriptions. Markers
on another floor stay visible but fade (pins also desaturate and return to full strength on hover
or tap); their floor badge keeps full contrast. Counts describe displayed levels, not stair routes
or guaranteed in-game access. Raw coordinates and their upstream provenance remain unchanged.

## Extract requirement cues and details

Extract pins show always-visible requirement icons beside the pin head, ahead of the on-demand
name label, in the Layers panel's "Extract icons" key order. Up to three icons show, then `+N`;
the co-op handshake is skipped on co-op pins because the glyph already shows it. Selecting an
extract (or pressing Enter on its marker) opens a compact plain-text popup above the pin head, so
the pin and its name stay visible: one icon row per requirement with a short instruction and an
optional qualifier (price variance, train window). The data source and the not-live notice appear
once per map, in a line at the map's lower-left corner, instead of in every popup. It names the
game client version for the current mode, says when the map also uses curated cues, and gives
the full client build and curation note on hover. Money, item handover, keys, gear, empty
backpack/armor slots, flares, activation, green smoke, train, timer, conditional availability,
and unknown requirements have distinct icons. These cues supplement faction glyphs and floor
badges; they never indicate live raid availability or replace the in-raid extraction list.

The rules come from the data overlay, because the public static API omits equipment
restrictions, opening chances, timers, and requirement references. The overlay's `eft:extracts`
generates its `extractRequirements` section from the game client's `/client/locations` and
`/client/globals` definitions, read from the private RemoteSession worker, and keys each entry by
map ID and the tarkov.dev extract ID matched on the raw exit name. Hand-curated scene cues live in
its separate `extractCues` section, each with a public reference. Both record only client builds
and a definitions hash, never capture dates, hosts, or session data. Production never contacts
the capture tooling.

`GET /api/tarkov/extract-requirements` serves both sections together for every mode
([overlay ownership](./overlay-and-precompute.md#endpoint-ownership-and-precedence)). Its `data`
is null until the overlay publishes valid sections, and the route returns 503 without an overlay.
`useExtractRuleData` requests the route once per page load and holds no rule data until a
payload passes the shared `app/utils/extractRuleData.ts` checks; the app ships no bundled copy
. Without rule data
(still loading, a null `data`, a malformed payload, or an unavailable overlay, including local
runs without `OVERLAY_TOKEN`) every extract shows the unknown-requirements cue plus any tarkov.dev
transfer cost, never the "No requirements listed" line, and the map omits the source line. Co-op
classification then falls back to the extract name. The map redraws extract pins and the source
line when the data arrives.

Rules shared by the Regular and Seasonal captures sit in `rules`; otherwise `pvp` and `seasonal`
keep their own lists, and a mode without a capture has no rules (an unknown-requirements cue).
PvE has no session of its own, so it reads the regular definitions' `countPve` / `percentPve` /
`minPve` / `maxPve` values. A chance that is 100% in the current mode shows nothing, so an exit closed only in PvE shows its chance only in PvE. Never join translated names or assume a
same-named exit on another map has the same requirements. Unmatched or incomplete exits keep an
unknown-requirements cue, and raw switch references alone do not imply a power requirement.

`Reference` resolves through `globals.config.RequirementReferences`, including Alpinist's
Paracord, Red Rebel, and empty `ArmorVest` slot. `Empty` uses its actual `RequiredSlot`.
`TransferItem` is distinct from `HasItem`, and a shared-timer transfer is a vehicle. Train counts
are never treated as money. Costs are base configuration amounts, not reputation-adjusted prices.
In particular Ground Zero's vehicle is 20,000 roubles in regular/Seasonal and 5,000 in the PvE
field; Interchange's PvE base cost is still 20,000. A configured `Chance` is not a live status
signal. Timers describe the configured arrival/activation window, not a guarantee an exit remains
usable afterward. Lighthouse's PvE train window differs from PvP's and is shown per mode.

Curated cues cover what the definitions do not describe: green flares for
Mira Avenue,
Railroad Passage,
Power Line Passage, and
Klimov Street; a flare of
unconfirmed color for Path to River; green smoke for
ZB-016,
ZB-014 (with its key), and
Old Gas Station;
and the Factory emergency exit key beside ZB-013's activation requirement. Smoke is an
availability signal, not a flare the player must bring. Additional activation steps and cues are
not invented when data is missing. Refresh both sections in the overlay; the app keeps no copy.

## Map markers, legend, and sizing

`app/features/maps/utils/markerGlyphs.ts` draws 30 px pins anchored at their tips. PMC, Scav,
co-op and transit use distinct glyphs. Shared and unknown extracts share the exit glyph but
keep their classification and colors. Names show on hover, tap, zoom or Always show names.
Enter opens extract details. Transit pins stay out of the tab order. Accessible labels include
name, floor direction and requirements.

`app/features/maps/utils/objectiveGlyphs.ts` draws high-contrast 26 px chips by upstream type.
The transparent same-size dot or zone owns hover, click and stacked hit-testing. Keep the chip
above its zone and below extract pins. Distant-floor chips fade and regain contrast on hover.
Zone outlines appear at two chip widths/heights or on hover at any size.

`app/features/maps/utils/objectiveColors.ts` owns category, quest and objective-type colors,
color-blind-safe palettes and overrides. Stable automatic colors use pre-hide `mapTaskIds`.
Hiding, show-only and manual overrides cannot recolor other quests. Changing the eligible
set may reassign colors. Category rows still filter in other color modes. Glyphs always identify
types and the quest legend labels each color.

`app/features/maps/utils/objectivePopup.ts` builds trader, task, trusted links, level, action,
item/gear, quantity, FIR and key-group details. Multi-count objectives show progress. Read-only
popups omit toggles/progress. Editable popups mark/unmark, jump to the task list and hide or
show only that quest. Compact density uses icon-only footer controls.

`app/features/maps/utils/mapLayerGroups.ts` owns the Layers panel. Task rows are always
listed; extract/location rows depend on drawable markers. Hidden rows remain listed.
Shared/unknown and co-op start visible when either faction's extracts starts visible.
The shared row shows “unknown” only when the map contains unclassified markers. Local
`mapLayerVisibility` overrides defaults across refresh, navigation and fullscreen. Changing
the extract default clears remembered extract rows locally. Synced changes update unremembered
rows only. Panel open state is local. In narrow containers controls stack above the map and
the panel scrolls within its height cap.

Inline height follows 75% of the window, bounded by 320 px and 85%, until an explicit
drag/keyboard resize. Enter/double-click reset it. Migrate legacy `tasks_map_height` unless
it equals the old untouched default of 520. Keep panned or zoomed views on resize. Otherwise
refit via ResizeObserver with Leaflet native resize disabled.

## Map objective visibility and required items

`app/composables/useMapObjectiveMarks.ts` derives marks and shared objective visibility from the
same selected-map tasks. Pin by task ID before self/team classification. Locked/All may show
unowned locked objectives as self markers, never failed tasks. Pinned, self and team preferences
control markers separately. The summary uses `selfNeedsObjective` and includes only required
equipment/alternative key groups that the player still needs. Aggregate pinned and active
separately, following their own toggles. Team visibility never changes the summary.
Bring-mode includes canonical `objective.item` for bring objectives without `items`.

Apply local hidden task IDs after filters and categories. Hidden tasks leave visible marks and
summaries and move into a collapsed list, without being dropped from the filtered task set.
A direct-linked task stays in focus. Jumping to an objective unhides its task. Show only hides
other current `mapTaskIds`, show all unhides current map tasks, and new unlocks are shown.
The hidden list, layer choices and quest colors stay user-local.

Quest highlights prioritize marker hover, then legend hover/focus, then an explicit legend lock.
Hover channels clear independently on redraw, fullscreen switch or disposal. Hiding or losing
a quest, or changing color mode, drops its lock without automatic restoration. Share state
across inline/fullscreen and update chip classes without rebuilding markers.

Trader reputation filters the same tasks, marks and item summary by mode-scoped completion
rewards. Any gain is always offered. Clear an unavailable numbered minimum or the filter
when leaving Tasks → Maps. Preserve hidden state and direct-link focus. The empty state can
reset the filter even with the map closed.

Hit-test visible points and zones in container pixels. Count a zone/center as one. For
overlap, list points then zones smallest first. Choosing one pins its full popup.

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
- `app/features/maps/utils/objectiveColors.ts`, `app/features/maps/MapObjectiveColorControls.vue`,
  `app/features/maps/MapQuestLegend.vue` and `app/features/maps/composables/useMapTaskHighlight.ts` — objective color modes, quest colors and quest highlight.
- `app/features/tasks/MapHiddenTasksSection.vue` — collapsed list section for hidden map quests.

## Task list and Needed Items

### Task list loading

`app/composables/useInfiniteScroll.ts` loads eight-card batches only for connected, laid-out
sentinels. Hidden/detached elements use no budget. Keep preload margin and auto-load caps.

The tasks page waits on core, edition revalidation, objectives, rewards, items-lite, objective
mode counts and the first visible-task refresh. Other pages keep idle detail scheduling.
Metadata registers every in-flight core phase synchronously through success or failure.
Core replacements advance `tasksCoreRevision` even on a cache hit; incremental details do
not. Edition readiness reuses settled success/failure and joins in-flight work. Explicit
retry refreshes it. New requests supersede queued idle callbacks. Apply normalized replies
and errors only to the current mode/language/version.

Once core settles, a three-second gate bounds optional details and mode-count readiness.
Retry the count only when task replacement makes its response stale. Empty data skips the
gate. Errors or timer expiry unblock rendering. Scope changes invalidate old waits. Keep
old loaded objectives visible after retryable failures. A warm cache or empty-to-populated
recovery still refreshes filters before empty states and deep-link effects settle.

### Task card layout and legacy density preferences

Task cards always use compact spacing. There is no density selector or persisted density
preference. Hydration discards legacy `taskCardDensity` values, including comfortable; remote
`task_card_density` values are ignored and new preference writes omit that column. Keep the
database column for older clients; this UI change requires no column removal or data rewrite.

Collapse-by-default and hide-rewards remain independent preferences, both off by default.
Collapse-by-default applies to list cards; map cards start expanded. Matching deep links expand
their card. If a linked quest is absent from the current mode's catalog, the Tasks page explains
why and offers to switch to any mode where the quest ID matches. The link stays active until
the quest opens or the player dismisses the notice.

The dedicated chevron controls card expansion in both views. When rewards are visible, the footer
shows rewards in labeled rows for progression, items and cash, and purchase unlocks. Only
categories with rewards appear. Items use the same thumbnail and links as objective items.
Short labels use catalog names with variant qualifiers where available, and full names when
the short labels would be ambiguous.
Every reward stays visible. Thumbnails show the full item name and larger image on hover, keyboard
focus, or tap. The Wiki and tarkov.dev links sit next to the image. Currency rewards use the same
thumbnails and links with a localized amount and currency symbol. Hide-rewards applies to both list
and map cards.
Missing database columns use the existing preference-sync fallback, so new settings remain local
until the compact-list preference migration is deployed.

### Needed Items views

Two independent toolbar choices replace the former list, grid and combined views and the grid
card-style toggle:

- **Show each item once** (`groupByItem`): when enabled, every quest and hideout need for an
  item is added together. When disabled, each task objective or hideout requirement has its own
  entry. The switch defaults on only when no grouping choice was saved; existing true/false
  choices, layouts and filters are preserved.
- **Layout**: _List_ (divided rows) or _Grid_ (tiles), stored as `neededItemsViewMode`.

Every combination is built from the same pieces in `app/features/neededitems/`: `NeededItemEntry`
(one need, `row` or `tile`), `NeededItemGroupEntry` (one item), `NeededItemThumb`,
`NeededItemSource` (quest or station link, lock and level hints, status, teammates) and
`NeededItemCounter`. Each requirement uses a collect toggle for single
items, a stepper for counted ones, a read-only count once the parent is done, and a teammate
note for needs kept only for teammates. Phones keep the stepper inline under the item name; no
layout opens a modal to track a single need. Grouped entries use `NeededItemGroupTracking` with
inline steppers and typed counts for the available FIR and Non-FIR totals, alongside the remaining
quantity (clamped at zero). Only the changed quantity is distributed: additions follow existing task/hideout priority,
and removals use reverse priority, preserving other allocations. Finished parent quests and
built modules stay read-only and contribute a protected minimum. Counts and Undo are scoped to
the current account and game mode; Undo survives a filtered-out card and rejects newer progress.
The optional _See where it’s needed_ action opens per-need details and the existing Smart Fill
replacement flow. The source badges count requirements in both modes; the result summary
always states its units and also counts unique items when the switch is enabled.
A checked handover displays its full quantity on the quest and moves to Completed in Needed
Items, even while the quest is still open. A pending teammate's requirement can still appear in
Needs. Unchecking restores the player's saved count.

With Hide owned enabled, grouped counters and their source breakdown retain the full matching
requirements, keeping tracked quantities and denominators stable as allocations fill. The
remaining count determines whether an item is still needed; fully collected items disappear.

`neededItemsCardStyle` remains a synced preference column for compatibility but no longer
affects rendering. The `needed_items_view` analytics event keeps `view_mode`
(`combined`, `list` or `grid`) and adds `layout`; switching layout in Items mode is tracked.
Entries render in batches of 24 after an initial 30 rows or 24 tiles (half on narrow screens).
Each entry looks up its task with the metadata store's indexed `getTaskById` instead of scanning
every task; the station lookup scans the short hideout station list.

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
item's displayed total stays aligned with its visible direct needs. Progress writes stay bound to the objective ID regardless
of which item identity is displayed.

Result membership and underlying grouped data use `filteredItems`, including the ownership filter.
Rendered grouped counters, their source breakdown and modal targets use the matching need list
without ownership filtering, so owned direct needs remain counted, editable and resettable while
the item is still needed. Resolve the modal's accepted-item suppression against the
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
