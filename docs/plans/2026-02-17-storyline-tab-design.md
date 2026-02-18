# Storyline Progress Tab Design

## Summary

Add a "Storyline" tab to the Profile Progression page that tracks completion of Tarkov 1.0 story chapters. Chapter metadata is fetched from the tarkov-data-overlay (same source as editions). Completion is tracked per chapter with a simple toggle, persisted alongside existing progress data.

## Data Layer

### StoryChapter type (app/types/tarkov.ts)

```ts
interface StoryChapter {
  id: string;
  name: string;
  normalizedName: string;
  wikiLink: string;
  order: number;
  autoStart?: boolean;
  chapterRequirements?: Array<{ id: string; name: string }>;
  mapUnlocks?: Array<{ id: string; name: string }>;
  traderUnlocks?: Array<{ id: string; name: string }>;
}
```

### Metadata store (useMetadata.ts)

- Add `storyChapters: StoryChapter[]` to state.
- In `fetchEditionsData`, extract `storyChapters` from the overlay response alongside editions. Cache together under the existing editions cache entry.

### Progress tracking (progressState.ts / useTarkov.ts)

- Add `storyChapters: Record<string, { complete?: boolean; timestamp?: number }>` to `UserProgressData`.
- Persisted to Supabase via existing sync mechanism.

## UI Layer

### ProfileProgression.vue

- Add 4th tab item: label=storyline, icon=i-mdi-book-open-variant, badge=completed/total.
- Render `<ProfileStorylineTab>` when `selectedTabIndex === 3`.
- Compute `storyChapterCompletionState` from modeData (same pattern as hideout).

### ProfileStorylineTab.vue

- Props: `storyChapterCompletionState: Record<string, boolean>`.
- Renders chapters sorted by order in a card grid (same layout as hideout tab).
- Each card shows: name, order badge, auto-start/discovered indicator, prerequisite chapters, map unlocks, trader unlocks, wiki link, completion icon, binary progress bar.
- Empty state alert when no chapters loaded.

## Scope

- Chapter-level completion only (no per-objective tracking).
- Read-only in profile view; toggle completion from the main tasks/storyline UI (future work).
- Shared profile support inherits from existing modeData pattern.
