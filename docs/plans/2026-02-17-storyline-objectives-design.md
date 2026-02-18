# Storyline Chapter Objectives Design

## Goal

Wire per-chapter objectives from community-sourced data into the overlay, and consume them in TarkovTracker for individual objective tracking.

## Data Sources

- Chapter objectives: [storylineQuests.ts](https://github.com/Wilsman/task-tracker/blob/master/src/data/storylineQuests.ts) (9 chapters, main + optional objectives, descriptions, rewards)
- Existing overlay: `tarkov-data-overlay/src/additions/storyChapters.json5` (9 chapters with metadata only)

## Overlay Changes (`tarkov-data-overlay`)

### Extended StoryChapter shape

New fields added to each chapter entry in `storyChapters.json5`:

```jsonc
{
  "tour": {
    // ...existing: id, name, normalizedName, wikiLink, order, autoStart, chapterRequirements, mapUnlocks, traderUnlocks
    "description": "Starting quest - automatically unlocked at the beginning of the storyline",
    "notes": null,
    "objectives": [
      { "id": "tour-main-1", "type": "main", "description": "Escape Ground Zero" },
      {
        "id": "tour-opt-1",
        "type": "optional",
        "description": "Collect the required 250,000 Roubles",
      },
    ],
    "rewards": {
      "description": "Unlocks achievement Pathfinder, traders (Skier, Mechanic, Prapor, Peacekeeper), and direct access to all locations",
    },
  },
}
```

### StoryObjective structure

| Field       | Type                     | Required | Description                                     |
| ----------- | ------------------------ | -------- | ----------------------------------------------- |
| id          | string                   | yes      | Globally unique, format: `{chapter}-{type}-{n}` |
| type        | `"main"` \| `"optional"` | yes      | Whether objective is required                   |
| description | string                   | yes      | Human-readable objective text                   |
| notes       | string                   | no       | Additional guidance or tips                     |

### ID convention

`{chapter-normalized-name}-{main|opt}-{sequence}` (e.g., `tour-main-1`, `falling-skies-opt-1`). Self-documenting, sortable, collision-free.

### Files changed

1. **`src/additions/storyChapters.json5`** — add objectives, description, notes, rewards to all 9 chapters
2. **`src/schemas/story-chapter.schema.json`** — add `description`, `notes`, `objectives`, `rewards` properties; objectives validates type enum
3. **`src/lib/types.ts`** — add `StoryObjective` interface; extend `StoryChapter` with new optional fields

No build script changes needed — existing pipeline loads all fields automatically.

## TarkovTracker Changes

### Types (`app/types/tarkov.ts`)

Add `StoryObjective` interface. Extend `StoryChapter` with `description?`, `notes?`, `objectives?`, `rewards?`.

### Progress state (`app/stores/progressState.ts`)

Extend story chapter progress entry:

```typescript
storyChapters: {
  [chapterId: string]: {
    complete?: boolean;
    timestamp?: number;
    objectives?: { [objId: string]: { complete?: boolean; timestamp?: number } }
  }
}
```

Add actions: `setStoryObjectiveComplete`, `setStoryObjectiveUncomplete`, `toggleStoryObjectiveComplete`.
Add getter: `isStoryObjectiveComplete(chapterId, objectiveId)`.

### UI (`app/features/profile/ProfileStorylineTab.vue`)

- Render objectives as a checklist per chapter card, grouped by type (main first, optional second)
- Per-objective toggle checkbox
- Progress bar: completed main objectives / total main objectives
- Optional objectives shown separately, do not affect main progress

### Metadata store (`app/stores/useMetadata.ts`)

`useMetadata` now normalizes `storyChapters` (via `normalizeStoryChapter`) and caches the full
`storyChapters` object for reuse, so both normalization and caching happen in the store path.

### Locales

Add keys: `storyline_main_objectives`, `storyline_optional_objectives` (all 7 locales).

## Backwards Compatibility

- All new overlay fields are optional — old consumers ignore them
- Progress state uses optional chaining for objectives — missing data defaults to incomplete
- Schema uses `additionalProperties: true` already

## Maintainability

- Adding an objective = one line in `storyChapters.json5`, no code changes
- Schema validates type enum and required fields at build time
- Source comments in JSON5 per chapter for auditability
