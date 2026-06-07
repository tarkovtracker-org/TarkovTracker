# Dashboard Redesign — Action-Oriented Layout

**Status:** Concept / future work
**Source:** Salvaged from stale branches `wip/dashboard-save-2026-02-24` and `dashboard-ui-improvements`

## Problem

The current dashboard is a stats grid (tasks completed, objectives, items, hideout items, kappa, lightkeeper). It shows _how much_ the user has done but not _what to do next_. Users have to mentally parse multiple progress bars to figure out their next action.

## Proposed Solution

Replace the stats grid with an action-oriented layout:

### 1. "Next Up" Hero Section

- Show available tasks the user can start right now
- Surface a suggested "next task" based on priority
- Display failed branch count with alert styling
- Show overall task progress bar
- Link to the full task list

### 2. Quick Actions Grid

- **Needed Items** — count of remaining items with link to needed-items page
- **Hideout Upgrades** — count of available upgrades with link to hideout page
- **Map Priority** — show which map has the most available tasks, link to map view
- **Kappa Progress** — tasks completed / total with link to kappa page
- **Failed Branches** — count with link to review

### 3. Responsive Trader Section

- On desktop: expanded by default showing full trader cards
- On mobile: collapsed with mini preview cards (trader image, name, progress bar)
- "Show LL & Rep Controls" CTA when collapsed
- Toggle remembers user preference during session

### 4. New Composable: `useHideoutFiltering`

- Expose hideout station counts (all, available, locked, maxed)
- Expose loading state for hideout data

## New Locale Keys Needed

```text
page.dashboard.next_up.*
page.dashboard.quick_actions.*
page.dashboard.traders.subtitle
page.dashboard.traders.show_controls
```

## Components to Create

- `DashboardNextUp.vue` — hero section with available tasks and suggested next task
- `DashboardQuickActions.vue` — grid of quick action cards with live counts

## Dependencies

- `useDashboardStats` needs new computed properties: `availableTasks`, `mapPriority`, `neededItemsRemaining`
- `useHideoutFiltering` composable (or similar) for hideout station counts
- `useSharedBreakpoints` for responsive trader section behavior

## Notes

- The stale branches used `.json5` locale files which don't exist on main. All i18n keys should go in `en.json` only.
- The stale branches had partially written tests. New tests should be written fresh against the current codebase.
- Keep the changelog section at the bottom of the dashboard.
