# Data Models — TarkovTracker

> Core data structures. Two domains: **game data** (immutable, from tarkov.dev) defined in
> `app/types/tarkov.ts`, and **user progress** (mutable, synced) defined in `app/types/progress.ts`
> and the Supabase schema. Edge Function/DB types are generated in
> `supabase/functions/_shared/database.types.ts` — do not duplicate them by hand.

## Game Data Model (`app/types/tarkov.ts`)

```mermaid
classDiagram
    class Task {
        string id
        string name
        boolean kappaRequired
        boolean lightkeeperRequired
        number experience
        number minPlayerLevel
        string factionName
        string[] predecessors
        string[] successors
        string[] alternatives
    }
    class TaskObjective {
        string id
        string type
        string description
        number count
        boolean foundInRaid
        boolean optional
    }
    class TaskRequirement {
        string[] status
    }
    class FinishRewards {
        TraderStandingReward[] traderStanding
        ItemReward[] items
        OfferUnlockReward[] offerUnlock
        SkillLevelReward[] skillLevelReward
    }
    class Trader {
        string id
        string name
        TraderLoyaltyLevel[] levels
    }
    class TarkovMap {
        string id
        string name
        MapSpawn[] spawns
        MapExtract[] extracts
    }
    class HideoutStation {
        string id
        string name
        HideoutLevel[] levels
    }
    class HideoutLevel {
        number level
        number constructionTime
        ItemRequirement[] itemRequirements
        Craft[] crafts
    }
    class TarkovItem {
        string id
        string name
        string shortName
        ItemCategory category
    }

    Task --> TaskObjective : objectives
    Task --> TaskRequirement : taskRequirements
    Task --> FinishRewards : start/finishRewards
    Task --> Trader : trader
    Task --> TarkovMap : map
    HideoutStation --> HideoutLevel : levels
    HideoutLevel --> Craft : crafts
    TaskObjective --> TarkovItem : item/items
    FinishRewards --> ItemReward
    ItemReward --> TarkovItem
```

### Key game-data types

| Type                                                                       | Purpose                     | Notable fields                                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Task`                                                                     | A quest                     | `kappaRequired`, `lightkeeperRequired`, `minPlayerLevel`, `taskRequirements`, `predecessors`/`successors`/`parents`/`children`, `alternatives`, `disabled`        |
| `TaskObjective`                                                            | One objective within a task | `type`, `count`, `foundInRaid`, `optional`, `items`/`markerItem`/`questItem`, `zones`/`possibleLocations`, `requiredKeys`                                         |
| `TaskRequirement`                                                          | Prereq link to another task | `task.id`, `status[]`                                                                                                                                             |
| `RequiredKeyGroup`                                                         | Keys needed for a task      | `keys[]`, `maps[]`, `optional`, `anyOf`                                                                                                                           |
| `FinishRewards`                                                            | Quest rewards               | `traderStanding`, `items`, `offerUnlock`, `skillLevelReward`, `traderUnlock`                                                                                      |
| `HideoutStation` / `HideoutLevel` / `HideoutModule`                        | Hideout data + graph nodes  | `itemRequirements`, `stationLevelRequirements`, `skillRequirements`, `traderRequirements`, `crafts`; module adds `predecessors`/`successors`/`parents`/`children` |
| `TarkovItem` / `ItemRequirement`                                           | Items + quantities          | `shortName`, `category`, `containsItems`; requirement adds `count`, `quantity`, `foundInRaid`                                                                     |
| `Trader` / `TraderLoyaltyLevel`                                            | Traders + loyalty           | `requiredPlayerLevel`, `requiredReputation`, `requiredCommerce`                                                                                                   |
| `TarkovMap` / `MapSpawn` / `MapExtract` / `MapSvgConfig` / `MapTileConfig` | Maps + geometry             | spawn `position`, extract `faction`, SVG/tile `bounds`, `coordinateRotation`, `floors`                                                                            |
| `PlayerLevel`                                                              | Level XP thresholds         | `exp` stored as **cumulative** (transformed from API increments)                                                                                                  |
| `PrestigeLevel`                                                            | Prestige tiers (0–6)        | `conditions`, `rewards`, `transferSettings`                                                                                                                       |
| `StoryChapter` / `StoryObjective`                                          | Storyline progression       | `order`, `mutuallyExclusiveWith`, `mapUnlocks`, `traderUnlocks`                                                                                                   |
| `GameEdition`                                                              | Game edition bonuses        | `defaultStashLevel`, `traderRepBonus`, `exclusiveTaskIds`, `excludedTaskIds`                                                                                      |

### Query result types

`tarkov.ts` also defines the response envelopes used by the metadata store and proxy adapters:
`TarkovBootstrapQueryResult`, `TarkovTasksCoreQueryResult`, `TarkovTaskObjectivesQueryResult`,
`TarkovTaskRewardsQueryResult`, `TarkovHideoutQueryResult`, `TarkovItemsQueryResult`,
`TarkovMapSpawnsQueryResult`, `TarkovPrestigeQueryResult`.

### Needed-items aggregation types

`NeededItemTaskObjective` and `NeededItemHideoutModule` (discriminated by `needType`) feed into
`GroupedNeededItem`, which aggregates per-item totals across tasks and hideout with FIR / non-FIR
split and current-progress counters (`taskFir`, `hideoutNonFir`, computed `total`/`currentCount`).

## User Progress Model (`app/types/progress.ts`)

`UserProgressData` is the persisted/synced progress record per game mode.

```mermaid
classDiagram
    class UserProgressData {
        number level
        string pmcFaction  // USEC | BEAR
        string displayName
        number xpOffset
        number prestigeLevel
        number progressEpoch
    }
    class TaskCompletion {
        boolean complete
        boolean failed
        number timestamp
        boolean manual
    }
    class TaskObjective {
        number count
        boolean complete
        number timestamp
    }
    class HideoutPart {
        number count
        boolean complete
    }
    class TraderProgress {
        number level
        number reputation
    }
    class ApiUpdateMeta {
        string source  // "api"
        number at
    }

    UserProgressData --> TaskCompletion : taskCompletions
    UserProgressData --> TaskObjective : taskObjectives
    UserProgressData --> HideoutPart : hideoutParts
    UserProgressData --> TraderProgress : traders
    UserProgressData --> ApiUpdateMeta : lastApiUpdate/history
```

Maps keyed by id: `taskObjectives`, `taskCompletions`, `hideoutParts`, `hideoutModules`,
`traders`, `skills`, `skillOffsets`, `storyChapters`. Also tracks `lastApiUpdate` and
`apiUpdateHistory` for API-driven changes.

## Store State Types

Defined in `app/types/tarkov.ts`:

- `SystemState` / `SystemGetters` — `user_id`, `tokens`, `team`, `pvp_team_id`, `pve_team_id`,
  `is_admin`; getters `userTokens`, `userTeam`, `userTeamIsOwn`, `isAdmin`.
- `TeamState` / `TeamGetters` — `owner`, `joinCode`, `members`, `memberProfiles`; getters
  `teamOwner`, `isOwner`, `inviteCode`, `teamMembers`, `teammates`.
- `MemberProfile` — `displayName`, `level`, `tasksCompleted`, `gameMode` (`pvp`|`pve`).

## Supabase Data Model

Derived from `supabase/migrations/`. RLS is enabled on user-owned tables; some operations go
through RPCs/Edge Functions for elevated privileges or rate limiting.

```mermaid
erDiagram
    user_progress ||--|| auth_users : "user_id"
    user_system ||--|| auth_users : "user_id"
    user_preferences ||--|| auth_users : "user_id"
    teams ||--o{ team_memberships : "team_id"
    team_memberships }o--|| auth_users : "user_id"
    api_tokens }o--|| auth_users : "owner"
    supporters }o--|| auth_users : "user_id"
    prestige_runs }o--|| auth_users : "user_id"

    user_progress {
        uuid user_id
        jsonb progress
        text game_mode
        int progress_epoch
    }
    user_system {
        uuid user_id
        uuid team_id
        bool is_admin
    }
    user_preferences {
        uuid user_id
        jsonb preferences
    }
    teams {
        uuid id
        uuid owner_id
        text game_mode
    }
    team_memberships {
        uuid team_id
        uuid user_id
        text game_mode
    }
    api_tokens {
        uuid id
        uuid owner
        text token_value
    }
    supporters {
        uuid user_id
        text tier
        text stripe_customer_id
    }
    stripe_events {
        text id
        timestamptz created_at
    }
```

| Table / object               | Role                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `user_progress`              | Per-user, per-mode progress JSON; realtime-enabled; payload sanitized via trigger/RPC       |
| `user_system`                | Per-user system row (team linkage, admin flag — admin column privilege-locked)              |
| `user_preferences`           | Per-user UI preferences (columns added incrementally via migrations)                        |
| `teams` / `team_memberships` | Team ownership + membership (game-mode aware; RLS tuned to avoid recursion)                 |
| `api_tokens`                 | Hashed API tokens for the gateway                                                           |
| `supporters`                 | Supporter tier + Stripe customer linkage                                                    |
| `stripe_events`              | Idempotency/retention for webhook events                                                    |
| `prestige_runs`              | Prestige run history (+ progress epoch)                                                     |
| `account_deletion_jobs`      | Account deletion job tracking                                                               |
| `admin_audit_log`            | Admin action audit trail                                                                    |
| RPCs                         | API gateway functions, atomic prestige progress, mutation rate limiting, ownership transfer |

> Game modes appear as `regular`/`pve` in the game-data API and `pvp`/`pve` in
> team/profile/membership contexts. Treat them as the same two-mode concept across layers.

## Static Local Data

- `app/data/maps.json` — map SVG/tile configuration (static).
- Storyline objective mutual-exclusion defaults live in `app/utils/storylineObjectives.ts`.
