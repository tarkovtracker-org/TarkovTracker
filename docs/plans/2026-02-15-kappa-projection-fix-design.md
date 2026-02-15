# Kappa Projection Algorithm Fix

## Problem

The Kappa Timeline estimate in ProfileProgression.vue produces unrealistic ETAs because:

1. Single-day burst sessions inflate pace (37 tasks/1 day = 37/day pace)
2. No awareness of sequential task prerequisite chains or level gates
3. Confidence rating ignores sample time span (37 tasks in 1 day = "High confidence")

## Design

All changes are scoped to `app/features/profile/ProfileProgression.vue` in the `kappaProjection` computed and supporting helpers.

### 1. Critical Path Floor

Compute the longest chain of incomplete prerequisites among remaining Kappa tasks. This establishes a minimum days floor the estimate cannot go below.

- Build a set of incomplete Kappa task IDs
- For each, recursively walk `predecessors` counting incomplete tasks in the chain (memoized)
- For tasks with `minPlayerLevel` above the player's current level, add `(requiredLevel - currentLevel)` days as a level-gap penalty to that task's chain depth
- `daysRemaining = Math.max(paceBasedDays, criticalPathFloor)`

### 2. Confidence Rating Overhaul

Factor both sample count AND sample time span:

- **High**: 15+ samples AND 7+ days
- **Medium**: 7+ samples AND 3+ days
- **Low**: meets minimum (3+ samples) but below medium thresholds
- **No estimate**: < 3 samples (unchanged)

### 3. Short-Window Pace Dampening

When `sampleDays < 3`, multiply raw pace by `sampleDays / 3`:

- 1-day window: pace reduced to 1/3
- 2-day window: pace reduced to 2/3
- 3+ days: no dampening

### 4. Detail Text Updates

Surface the floor constraint when active so users understand the estimate basis. Add a note about sequential prerequisites when the floor exceeds the pace-based estimate.

## Files Modified

- `app/features/profile/ProfileProgression.vue` (only file)

## What Does Not Change

- Completed/unknown states
- Fallback to all-task timestamps
- Share snapshot format structure
- Template layout and UI components
