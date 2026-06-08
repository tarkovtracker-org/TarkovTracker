# Components — TarkovTracker

> Major components and their responsibilities. Components are grouped by layer. Paths are relative
> to the repository root. Use this to find _which module owns a behavior_.

## Pinia Stores (`app/stores/`)

| Component             | File                | Responsibility                                                                                                                                                                         |
| --------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useTarkovStore`      | `useTarkov.ts`      | Owns user progress (tasks, objectives, hideout, level, skills, prestige). Coordinates localStorage persistence, Supabase sync init/reset, migrations, and task repair.                 |
| `useMetadataStore`    | `useMetadata.ts`    | Loads + caches static game data (tasks, items, maps, traders, hideout, prestige). Two-phase loading, IndexedDB caching, item hydration, dependency graph building, cache-purge checks. |
| `usePreferencesStore` | `usePreferences.ts` | UI settings and filter state (task/needed-items/hideout/map view options, streamer mode, profile sharing). Persisted and synced to `user_preferences`.                                 |
| `useProgressStore`    | `useProgress.ts`    | Computed facade: per-team task completions, unlocked tasks (prereq-aware), hideout levels, objective completions, invalid-task detection.                                              |
| `useTeamStore`        | `useTeamStore.ts`   | Team membership, teammate stores, invite codes, teammate progress aggregation.                                                                                                         |
| `useSystemStore`      | `useSystemStore.ts` | Session/system state: `user_id`, tokens, team ids (pvp/pve), admin flag.                                                                                                               |
| `useApp`              | `useApp.ts`         | UI chrome state (drawer rail/show, mobile drawer).                                                                                                                                     |
| `progressState`       | `progressState.ts`  | Low-level progress mutation primitives (set/toggle task, objective, hideout, skill, trader, story, prestige, game-mode switch/migration).                                              |

### Tarkov store internals (`app/stores/tarkov/`)

| File                   | Responsibility                                         |
| ---------------------- | ------------------------------------------------------ |
| `realtimeListener.ts`  | Supabase realtime subscription lifecycle for progress. |
| `progressMerge.ts`     | Merge remote/local progress with conflict rules.       |
| `conflictDetection.ts` | Detect divergence between local and remote state.      |
| `prestige.ts`          | Prestige run logic and prestige-level handling.        |
| `hideoutPrereqs.ts`    | Enforce hideout prerequisite completion.               |
| `resetEngine.ts`       | Reset progress (all / per-mode / current mode).        |
| `localStorage.ts`      | User-scoped persistence helpers.                       |
| `promiseStore.ts`      | In-flight request de-duplication.                      |
| `apiUpdateNotifier.ts` | Surface API-driven task update notifications.          |

## Composables (`app/composables/`)

Reusable composition functions. Notable ones:

| Composable                                                           | Responsibility                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `useAppInitialization.ts`                                            | App bootstrap sequencing.                                     |
| `useGraphBuilder.ts` / `useTaskGraphData.ts`                         | Build task/hideout dependency graphs for Vue Flow.            |
| `useTaskFiltering.ts` / `useTaskCounts.ts` / `useTaskActions.ts`     | Task list filtering, counting, and mutations.                 |
| `useNeededItems.ts` / `useItemDistribution.ts`                       | Aggregate and distribute required items across tasks/hideout. |
| `useDashboardStats.ts` / `useDashboardRecommendations.ts`            | Dashboard metrics and "next action" recommendations.          |
| `useStorylineChapters.ts`                                            | Storyline chapter progression state.                          |
| `useSkillCalculation.ts` / `useXpCalculation.ts`                     | Skill/XP/level derivations.                                   |
| `useLeafletMap.ts` / `useMapObjectiveMarks.ts` / `useMapResize.ts`   | Interactive map rendering and objective markers.              |
| `useDataBackup.ts` / `useDebugStateExport.ts`                        | Export/import + debug snapshots of progress/preferences.      |
| `useTarkovDevImport.ts` / `useEftLogsImport.ts`                      | Import progress from tarkov.dev profiles and EFT log files.   |
| `useSupporter.ts`                                                    | Supporter status + Stripe checkout/portal entry points.       |
| `useOAuthLogin.ts` / `useOAuthConsent.ts` / `useAnalyticsConsent.ts` | Auth popup flow + consent management.                         |
| `api/useEdgeFunctions.ts`                                            | Typed wrapper for invoking Supabase Edge Functions.           |
| `supabase/useSupabaseSync.ts` / `useSupabaseListener.ts`             | Progress sync + realtime listening.                           |

## Plugins (`app/plugins/`)

Client-only plugins, **numbered to control load order**:

| Plugin                                                             | Role                                        |
| ------------------------------------------------------------------ | ------------------------------------------- |
| `00.storage-version.client.ts`                                     | Storage schema/version guard.               |
| `01.pinia.client.ts`                                               | Install Pinia persistence plugins.          |
| `02.automatic-level-sync.client.ts`                                | Auto-derive player level from XP.           |
| `03.error-monitoring.client.ts`                                    | Client error monitoring.                    |
| `04.analytics-consent-mode.client.ts`                              | Keep analytics consent denied until opt-in. |
| `05.google-analytics.client.ts` / `06.microsoft-clarity.client.ts` | Analytics integrations (consent-gated).     |
| `supabase.client.ts`                                               | Supabase client + auth wiring.              |
| `i18n.client.ts`                                                   | Locale initialization.                      |
| `metadata.client.ts`                                               | Kick off game-data load.                    |
| `zz.preferences-sync.client.ts`                                    | Preferences sync (runs last).               |

## App Chrome (`app/shell/`) and Global Components

| Component                 | Role                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| `shell/AppBar.vue`        | Top navigation bar.                                                              |
| `shell/NavDrawer.vue`     | Side navigation drawer.                                                          |
| `shell/AppFooter.vue`     | Footer (incl. analytics preferences control).                                    |
| `shell/LoadingScreen.vue` | Initial load screen.                                                             |
| `components/ui/*`         | Shared UI primitives (cards, tooltips, context menu, help spotlight, game item). |
| `components/analytics/*`  | Consent banner.                                                                  |

## Feature Components (`app/features/<slice>/`)

Each slice contains its Vue components and slice-local helpers/composables. High-traffic examples:

| Slice            | Key components                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `tasks`          | `TaskCard.vue`, `TaskFilterBar.vue`, `TaskObjective.vue`, `TaskGraphView.vue`, `composables/useTaskFilters.ts` |
| `hideout`        | `HideoutCard.vue`, `HideoutRequirement.vue`, `HideoutSettingsDrawer.vue`                                       |
| `maps`           | `LeafletMap.vue`, `LeafletObjectiveTooltip.vue`, `composables/useLeafletMapControls.ts`                        |
| `neededitems`    | `NeededItem*.vue` (row/card/grouped/modal), filter bar + settings drawer                                       |
| `dashboard`      | `DashboardNextActions.vue`, `DashboardTraderCard.vue`, `DashboardChangelog.vue`                                |
| `settings`       | `DataManagementCard.vue`, `ApiTokens.vue`, `PrestigeCard.vue`, `SkillsCard.vue`, `AccountDeletionCard.vue`     |
| `team`           | `MyTeam.vue`, `TeamInvite.vue`, `TeamMemberCard.vue`                                                           |
| `profile`        | `ProfileProgression.vue`, `Profile*Tab.vue`                                                                    |
| `supporter`      | `SupporterTierCard.vue`, `SupporterOneTime.vue`, `SupporterStatusBanner.vue`                                   |
| `streamer-tools` | `StreamerToolsPanel.vue`, `composables/useStreamerToolsOverlay.ts`                                             |
| `kappa`          | `KappaTaskRow.vue`, `useKappaOverview.ts`                                                                      |

## Server Components (`app/server/`)

| Component                | File                                                                                                            | Responsibility                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Tarkov proxy routes      | `api/tarkov/*.get.ts`                                                                                           | Serve game data via cache + overlay.             |
| json.tarkov.dev adapters | `utils/tarkov-json.ts`                                                                                          | Fetch + adapt static JSON into app types.        |
| Overlay engine           | `utils/overlay.ts`                                                                                              | Apply community data corrections/additions.      |
| Edge cache               | `utils/edgeCache.ts`, `utils/sharedEdgeStore.ts`, `utils/edgeCacheKey.ts`                                       | Cloudflare cache integration + keys.             |
| API protection           | `middleware/api-protection.ts`                                                                                  | CORS, auth, host/IP allowlist, public routes.    |
| Team/profile             | `api/team/members.ts`, `api/profile/[userId]/[mode].get.ts`                                                     | Team + shared profile data (cache + rate limit). |
| Stripe                   | `api/stripe/{checkout,portal}.post.ts`, `utils/stripeCheckoutValidation.ts`, `utils/supporterCustomerLookup.ts` | Checkout/portal sessions + validation.           |
| Streamer overlay         | `routes/overlay/kappa/[userId]/[mode].get.ts`, `utils/streamerKappa.ts`                                         | Server-rendered overlay output.                  |
| Misc                     | `api/changelog.get.ts`, `api/contributors.get.ts`, `api/twitch/live.get.ts`, `api/tarkov-dev/profile.get.ts`    | Supporting endpoints.                            |

## Supabase Edge Functions (`supabase/functions/`)

| Function                                                                  | Responsibility                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `team-create` / `team-join` / `team-leave` / `team-kick` / `team-members` | Team lifecycle (per-user rate limited).                                             |
| `token-create` / `token-revoke`                                           | API token issuance/revocation (hashed storage).                                     |
| `account-delete` / `account-delete-reconcile`                             | Account deletion job + reconciliation.                                              |
| `stripe-webhook`                                                          | Process Stripe events; grant/revoke supporter; sync Discord roles.                  |
| `admin-cache-purge`                                                       | Purge Cloudflare + data caches (admin-gated).                                       |
| `_shared/*`                                                               | `auth.ts`, `cors.ts`, `discord.ts`, `rate-limit.ts`, generated `database.types.ts`. |

## Cloudflare Worker (`workers/api-gateway/src/`)

| Component                                     | Responsibility                                                 |
| --------------------------------------------- | -------------------------------------------------------------- |
| `index.ts`                                    | Worker entry, routing, `ApiGatewayRateLimiter` Durable Object. |
| `auth.ts`                                     | Bearer token extraction, SHA-256 validation, usage tracking.   |
| `handlers/progress.ts`                        | Get/update progress (tasks, objectives, level).                |
| `handlers/team.ts`                            | Team progress aggregation.                                     |
| `handlers/token.ts`                           | Token info endpoint.                                           |
| `services/tarkov.ts`                          | Fetch tasks/hideout for transforms.                            |
| `utils/transform.ts`                          | Progress transform + hideout auto-complete.                    |
| `utils/{invalidation,memory-cache,logger}.ts` | Cache invalidation + in-memory cache.                          |
| `openapi.ts`                                  | OpenAPI spec (validated in CI).                                |
