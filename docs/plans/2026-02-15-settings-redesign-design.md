# Settings Page Redesign

## Problem

The settings page feels dense and dated compared to the rest of the app. The Interface tab is one monolithic card, visual hierarchy is flat, and the tab structure doesn't match how other pages work.

## Approach

Replace the tabbed layout with a single scrollable page of focused GenericCards. Remove the "UI update in progress" alert banner. Narrow the max-width to `max-w-3xl` for better readability.

## Card Layout (top to bottom)

1. **Experience & Level** (mdi-star-circle, primary) — auto-level toggle, level display, XP bar, manual XP input, reset. Keep existing ExperienceCard as-is.
2. **Game Profile** (mdi-gamepad-variant, accent) — game edition + prestige dropdowns in 2-col grid.
3. **Task Display** (mdi-checkbox-marked-outline, info) — show required labels, XP rewards, next/prev quests; card density dropdown; default task/hideout view selectors.
4. **Map Settings** (mdi-map, success) — show extracts toggle, zoom/pan sliders, marker color picker.
5. **Skills Management** (mdi-brain, info) — existing skills grid with sort toggle, default shows required skills only with "Show all" button.
6. **Privacy & Streamer Mode** (mdi-eye-off, warning) — streamer mode toggle with description.
7. **API Tokens** (mdi-key-chain, secondary) — token list or login prompt.

## Visual Treatment

- Each card uses GenericCard with icon badge, gradient header, `text-lg font-semibold` title
- Content padding: `px-4 py-4`, controls use established patterns
- Sub-panels use `bg-surface-800/50 border-surface-700 rounded-lg border` for complex subsections
- Form grids: `grid gap-4 md:grid-cols-2`

## What Changes

- **Remove**: `<UAlert>` banner, `<UTabs>` wrapper
- **Refactor**: InterfaceSettingsCard splits into TaskDisplayCard and MapSettingsCard
- **Extract**: Privacy toggle becomes its own PrivacyCard
- **Keep**: ExperienceCard, SkillsCard, API tokens (minimal changes)
- **Narrow**: Page max-width from 1400px to 3xl (~768px)

## What Stays the Same

- All preference bindings and store interactions
- GenericCard component (no changes needed)
- Skills grid behavior (sort, collapse, input handling)
- API tokens component
