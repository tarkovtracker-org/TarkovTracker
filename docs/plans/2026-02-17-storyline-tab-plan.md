# Storyline Progress Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Storyline" tab to the Profile Progression page showing story chapter completion with metadata from the tarkov-data-overlay.

**Architecture:** Piggyback on the existing editions overlay fetch to load `storyChapters` into the metadata store. Add `storyChapters` progress field to `UserProgressData` (same pattern as `hideoutModules`). Render a new tab in `ProfileProgression.vue` using a `ProfileStorylineTab` component modeled after `ProfileHideoutTab`.

**Tech Stack:** Vue 3 `<script setup>`, Pinia stores, Tailwind v4, Nuxt UI `<UTabs>`, i18n via `useI18n`

---

## Implementation Tasks

### Task 1: Add StoryChapter type to tarkov.ts

**Files:**

- Modify: `app/types/tarkov.ts` (after the `PrestigeLevel` interface, around line 357)

**Step 1: Add the implemented storyline interfaces**

Insert after the `TarkovPrestigeQueryResult` interface (line 360):

```ts
export interface StoryObjective {
  id: string;
  order: number;
  type: 'main' | 'optional';
  description: string;
  notes?: string | null;
  mutuallyExclusiveWith?: string[];
}
export interface StoryRewards {
  description: string;
}
export interface StoryChapter {
  id: string;
  name: string;
  normalizedName: string;
  wikiLink: string;
  order: number;
  autoStart?: boolean;
  chapterRequirements?: Array<{ id: string; name: string }>;
  mapUnlocks?: Array<{ id: string; name: string }>;
  traderUnlocks?: Array<{ id: string; name: string }>;
  description?: string | null;
  notes?: string | null;
  objectives?: { [objectiveId: string]: StoryObjective };
  rewards?: StoryRewards | null;
}
```

**Step 2: Commit**

```bash
git add app/types/tarkov.ts
git commit -m "feat(storyline): add StoryChapter type definition"
```

---

### Task 2: Add storyChapters to UserProgressData

**Files:**

- Modify: `app/stores/progressState.ts` (UserProgressData interface ~line 67, defaultProgressData ~line 90)

**Step 1: Add storyChapters field to UserProgressData**

Add after the `skillOffsets` field (line 80):

```ts
  storyChapters: {
    [chapterId: string]: {
      complete?: boolean;
      timestamp?: number;
      objectives?: { [objectiveId: string]: { complete?: boolean; timestamp?: number } };
    };
  };
```

**Step 2: Add default value to defaultProgressData**

Add after `skillOffsets: {},` (line 102):

```ts
  storyChapters: {},
```

**Step 3: Add getter and actions for story chapters**

Add to `getters` (after `getTarkovDevProfile`, around line 264):

```ts
  isStoryChapterComplete: (state: UserState) => (chapterId: string) =>
    getCurrentData(state)?.storyChapters?.[chapterId]?.complete ?? false,
```

Add to `actions` (after `setTarkovDevProfile`, around line 455):

```ts
  setStoryChapterComplete(this: UserState, chapterId: string) {
    updateObjective(this, 'storyChapters', chapterId, {
      complete: true,
      timestamp: Date.now(),
    });
  },
  setStoryChapterUncomplete(this: UserState, chapterId: string) {
    updateObjective(this, 'storyChapters', chapterId, { complete: false });
  },
  toggleStoryChapterComplete(this: UserState, chapterId: string) {
    const isComplete = getters.isStoryChapterComplete(this)(chapterId);
    if (isComplete) {
      actions.setStoryChapterUncomplete.call(this, chapterId);
    } else {
      actions.setStoryChapterComplete.call(this, chapterId);
    }
  },
```

**Step 4: Update migrateToGameModeStructure**

In each `migratedProgressData` block (~lines 148-161 and ~lines 171-184), add:

```ts
      storyChapters: (data.storyChapters as UserProgressData['storyChapters']) || {},
```

**Step 5: Commit**

```bash
git add app/stores/progressState.ts
git commit -m "feat(storyline): add storyChapters to UserProgressData with getters and actions"
```

---

### Task 3: Add storyChapters to metadata store

**Files:**

- Modify: `app/stores/useMetadata.ts`

**Step 1: Add StoryChapter import**

Add `StoryChapter` to the import from `@/types/tarkov` (line 31):

```ts
  StoryChapter,
```

**Step 2: Add storyChapters to MetadataState**

Add after `editions: GameEdition[];` in the MetadataState interface (~line 278):

```ts
  storyChapters: StoryChapter[];
```

**Step 3: Add default state value**

Add after `editions: markRaw([]),` in the state initializer (~line 351):

```ts
    storyChapters: markRaw([]),
```

**Step 4: Update fetchEditionsData to extract storyChapters**

In `fetchEditionsData` (~line 1318), update the type annotation and extraction:

Change the `$fetch` type from:

```ts
const overlay = await $fetch<{ editions?: Record<string, GameEdition> }>(OVERLAY_URL, {
```

to:

```ts
const overlay = await $fetch<{ editions?: Record<string, GameEdition>; storyChapters?: Record<string, StoryChapter> }>(OVERLAY_URL, {
```

After the editions extraction block (~line 1323), add storyChapters extraction:

```ts
if (overlay?.storyChapters) {
  const chaptersArray = Object.values(overlay.storyChapters);
  chaptersArray.sort((a, b) => a.order - b.order);
  this.storyChapters = markRaw(chaptersArray);
} else {
  this.storyChapters = markRaw([]);
}
```

Also update the cache data to include storyChapters. Change the `setCachedData` call to include them:

```ts
setCachedData(
  'editions' as CacheType,
  'all',
  'en',
  { editions: editionsArray, storyChapters: chaptersArray ?? [] },
  CACHE_CONFIG.MAX_TTL
);
```

**Step 5: Update cache loading for storyChapters**

In `loadCriticalCacheData` (~line 686), update the editions cache type:

```ts
          getCachedData<{ editions: GameEdition[]; storyChapters?: StoryChapter[] }>(
```

After `this.editions = markRaw(cachedData.editions.editions || []);` (~line 1001), add:

```ts
if (cachedData.editions.storyChapters) {
  const sorted = [...cachedData.editions.storyChapters].sort((a, b) => a.order - b.order);
  this.storyChapters = markRaw(sorted);
}
```

Also update the cache read inside `fetchEditionsData` (~line 1300):

```ts
          const cached = await getCachedData<{ editions: GameEdition[]; storyChapters?: StoryChapter[] }>(
```

After `this.editions = markRaw(cached.editions);` (~line 1307), add:

```ts
if (cached.storyChapters) {
  const sorted = [...cached.storyChapters].sort((a, b) => a.order - b.order);
  this.storyChapters = markRaw(sorted);
}
```

**Step 6: Update the return type of loadCriticalCacheData**

Change the return type (~line 663) to:

```ts
    async loadCriticalCacheData(): Promise<{
      tasksCore: TarkovTasksCoreQueryResult;
      hideout: TarkovHideoutQueryResult;
      prestige: TarkovPrestigeQueryResult;
      editions: { editions: GameEdition[]; storyChapters?: StoryChapter[] };
    } | null> {
```

**Step 7: Commit**

```bash
git add app/stores/useMetadata.ts
git commit -m "feat(storyline): fetch and cache storyChapters from overlay"
```

---

### Task 4: Add i18n locale keys

**Files:**

- Modify: `app/locales/en.json5` (inside the `profile` section after `tab_hideout`)

**Step 1: Add English locale keys**

After `tab_hideout: 'Hideout',` (line 697), add:

```json5
      tab_storyline: 'Storyline',
      no_storyline: 'No storyline data available for this profile.',
      storyline_chapter: 'Chapter',
      storyline_auto_start: 'Auto-start',
      storyline_discovered: 'Discovered',
      storyline_requires: 'Requires',
      storyline_unlocks_maps: 'Unlocks maps',
      storyline_unlocks_traders: 'Unlocks traders',
      storyline_wiki: 'Wiki',
```

**Step 2: Commit**

```bash
git add app/locales/en.json5
git commit -m "feat(storyline): add English locale keys for storyline tab"
```

---

### Task 5: Create ProfileStorylineTab component

**Files:**

- Create: `app/features/profile/ProfileStorylineTab.vue`

**Step 1: Create the component**

```vue
<template>
  <div>
    <UAlert
      v-if="!chapterProgress.length"
      icon="i-mdi-book-off-outline"
      color="neutral"
      variant="soft"
      :title="t('page.profile.no_storyline')"
    />
    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="chapter in chapterProgress"
        :key="chapter.id"
        class="bg-surface-900 rounded-lg border border-white/10 p-3"
      >
        <div class="mb-2 flex items-center gap-2">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold"
            :class="
              chapter.complete
                ? 'bg-success-700/25 text-success-300'
                : 'bg-surface-800 text-surface-400'
            "
          >
            {{ chapter.order }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-surface-100 truncate text-sm font-semibold">
              {{ chapter.name }}
            </div>
            <div class="text-surface-400 flex items-center gap-1.5 text-xs">
              <UBadge v-if="chapter.autoStart" variant="subtle" color="info" size="xs">
                {{ t('page.profile.storyline_auto_start') }}
              </UBadge>
              <UBadge v-else variant="subtle" color="neutral" size="xs">
                {{ t('page.profile.storyline_discovered') }}
              </UBadge>
            </div>
          </div>
          <UIcon
            v-if="chapter.complete"
            name="i-mdi-check-circle"
            class="text-success-400 h-5 w-5 shrink-0"
          />
        </div>
        <div v-if="chapter.requirements.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_requires') }}
          </div>
          <div class="text-surface-300 text-xs">
            {{ chapter.requirements.map((r) => r.name).join(', ') }}
          </div>
        </div>
        <div v-if="chapter.mapUnlocks.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_unlocks_maps') }}
          </div>
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="map in chapter.mapUnlocks"
              :key="map.id"
              variant="subtle"
              color="primary"
              size="xs"
            >
              {{ map.name }}
            </UBadge>
          </div>
        </div>
        <div v-if="chapter.traderUnlocks.length" class="mb-1.5">
          <div class="text-surface-500 mb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {{ t('page.profile.storyline_unlocks_traders') }}
          </div>
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="trader in chapter.traderUnlocks"
              :key="trader.id"
              variant="subtle"
              color="warning"
              size="xs"
            >
              {{ trader.name }}
            </UBadge>
          </div>
        </div>
        <div class="mt-2 flex items-center justify-between">
          <NuxtLink
            :to="chapter.wikiLink"
            external
            target="_blank"
            rel="noopener noreferrer"
            class="text-info-400 hover:text-info-300 text-xs underline underline-offset-2"
          >
            {{ t('page.profile.storyline_wiki') }}
          </NuxtLink>
        </div>
        <div class="bg-surface-800/60 mt-2 h-1.5 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="chapter.complete ? 'bg-success-500/70' : 'bg-surface-700'"
            :style="{ width: chapter.complete ? '100%' : '0%' }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import type { StoryChapter } from '@/types/tarkov';

  interface Props {
    storyChapterCompletionState: Record<string, boolean>;
  }

  const props = defineProps<Props>();
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();

  interface ChapterProgress {
    id: string;
    name: string;
    order: number;
    autoStart: boolean;
    complete: boolean;
    wikiLink: string;
    requirements: Array<{ id: string; name: string }>;
    mapUnlocks: Array<{ id: string; name: string }>;
    traderUnlocks: Array<{ id: string; name: string }>;
  }

  const chapterProgress = computed<ChapterProgress[]>(() => {
    const chapters: StoryChapter[] = metadataStore.storyChapters ?? [];
    return chapters.map((chapter) => ({
      id: chapter.id,
      name: chapter.name || chapter.id,
      order: chapter.order,
      autoStart: chapter.autoStart ?? false,
      complete: props.storyChapterCompletionState[chapter.id] === true,
      wikiLink: chapter.wikiLink,
      requirements: chapter.chapterRequirements ?? [],
      mapUnlocks: chapter.mapUnlocks ?? [],
      traderUnlocks: chapter.traderUnlocks ?? [],
    }));
  });
</script>
```

**Step 2: Commit**

```bash
git add app/features/profile/ProfileStorylineTab.vue
git commit -m "feat(storyline): create ProfileStorylineTab component"
```

---

### Task 6: Wire storyline tab into ProfileProgression

**Files:**

- Modify: `app/features/profile/ProfileProgression.vue`

**Step 1: Add import for ProfileStorylineTab**

After the `ProfileTasksTab` import (~line 226), add:

```ts
import ProfileStorylineTab from '@/features/profile/ProfileStorylineTab.vue';
```

**Step 2: Add storyChapter completion state computed**

After `hideoutModuleCompletionState` computed (~line 889), add:

```ts
const storyChapterCompletionState = computed<Record<string, boolean>>(() => {
  const storyProgress = modeData.value.storyChapters ?? {};
  const state: Record<string, boolean> = {};
  for (const chapter of metadataStore.storyChapters ?? []) {
    state[chapter.id] = storyProgress[chapter.id]?.complete === true;
  }
  return state;
});
```

**Step 3: Add storyline counting computeds**

After `completedHideoutModules` computed (~line 898), add:

```ts
const totalStoryChapters = computed(() => metadataStore.storyChapters?.length ?? 0);
const completedStoryChapters = computed(() => {
  let count = 0;
  for (const chapterId of Object.keys(storyChapterCompletionState.value)) {
    if (storyChapterCompletionState.value[chapterId] === true) {
      count++;
    }
  }
  return count;
});
```

**Step 4: Add storyline tab to profileTabItems**

Add a 4th entry to the `profileTabItems` computed (~line 1529):

```ts
    {
      label: t('page.profile.tab_storyline'),
      icon: 'i-mdi-book-open-variant',
      badge: totalStoryChapters.value > 0
        ? `${formatNumber(completedStoryChapters.value)}/${formatNumber(totalStoryChapters.value)}`
        : undefined,
    },
```

**Step 5: Add storyline tab rendering**

After the `ProfileHideoutTab` block (~line 209), add:

```vue
<ProfileStorylineTab
  v-else-if="selectedTabIndex === 3"
  :story-chapter-completion-state="storyChapterCompletionState"
/>
```

**Step 6: Commit**

```bash
git add app/features/profile/ProfileProgression.vue
git commit -m "feat(storyline): wire storyline tab into profile progression page"
```

---

### Task 7: Update DEFAULT_PROGRESS_DATA in ProfileProgression

**Files:**

- Modify: `app/features/profile/ProfileProgression.vue`

**Step 1: Add storyChapters to DEFAULT_PROGRESS_DATA**

In the `DEFAULT_PROGRESS_DATA` constant (~line 263), add after `xpOffset: 0,`:

```ts
    storyChapters: {},
```

**Step 2: Update normalizeSharedProgressData**

In `normalizeSharedProgressData` (~line 439), add extraction for storyChapters. After the `skillOffsets` extraction (~line 468), add:

```ts
const storyChapters = isRecord(value.storyChapters)
  ? (value.storyChapters as UserProgressData['storyChapters'])
  : DEFAULT_PROGRESS_DATA.storyChapters;
```

And add `storyChapters` to the return object (~line 489):

```ts
      storyChapters,
```

**Step 3: Commit**

```bash
git add app/features/profile/ProfileProgression.vue
git commit -m "feat(storyline): support storyChapters in shared profile normalization"
```

---

### Task 8: Build and verify

**Step 1: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

**Step 2: Run format**

```bash
npm run format
```

**Step 3: Run tests**

```bash
npx vitest run
```

Expected: All existing tests pass (no regressions).

**Step 4: Final commit if format changed anything**

```bash
git add -A && git commit -m "chore(storyline): format and lint fixes"
```
