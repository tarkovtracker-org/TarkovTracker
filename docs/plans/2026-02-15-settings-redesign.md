# Settings Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the tabbed settings page with a clean vertical flow of focused GenericCards, improving scannability and visual hierarchy.

**Architecture:** Remove `<UTabs>` and `<UAlert>` banner. Split the monolithic InterfaceSettingsCard into TaskDisplayCard and MapSettingsCard. Extract privacy toggle into its own card. Keep ExperienceCard, SkillsCard, and ApiTokens as-is. Narrow page to max-w-3xl.

**Tech Stack:** Vue 3 `<script setup>`, Tailwind v4, Nuxt UI components, GenericCard, Pinia stores

---

### Task 1: Create TaskDisplayCard Component

**Files:**

- Create: `app/features/settings/TaskDisplayCard.vue`

**Step 1: Create the TaskDisplayCard component**

Extract the "Task Cards" and "Default Views" sections from InterfaceSettingsCard into a new focused component. This card handles: show required labels, show XP rewards, show next/prev quests checkboxes, card density dropdown, and default task/hideout view selectors.

```vue
<template>
  <GenericCard
    icon="mdi-checkbox-marked-outline"
    icon-color="info"
    highlight-color="info"
    :fill-height="false"
    :title="$t('settings.interface.tasks.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-6 px-4 py-4">
        <div class="grid gap-4 md:grid-cols-2">
          <UCheckbox
            v-model="showRequiredLabels"
            :label="$t('settings.interface.tasks.show_required')"
          />
          <UCheckbox
            v-model="showExperienceRewards"
            :label="$t('settings.interface.tasks.show_xp')"
          />
          <UCheckbox v-model="showNextQuests" :label="$t('settings.interface.tasks.show_next')" />
          <UCheckbox
            v-model="showPreviousQuests"
            :label="$t('settings.interface.tasks.show_prev')"
          />
        </div>
        <USeparator />
        <div class="grid gap-4 md:grid-cols-2">
          <div class="space-y-2">
            <p class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.interface.tasks.density') }}
            </p>
            <SelectMenuFixed
              v-model="taskCardDensity"
              :items="densityOptions"
              value-key="value"
              label-key="label"
            />
          </div>
          <div class="space-y-2">
            <p class="text-surface-200 text-sm font-semibold">
              {{ $t('page.tasks.title') }}
            </p>
            <SelectMenuFixed
              v-model="taskDefaultView"
              :items="taskViewOptions"
              value-key="value"
              label-key="label"
            />
          </div>
          <div class="space-y-2">
            <p class="text-surface-200 text-sm font-semibold">
              {{ $t('page.hideout.title') }}
            </p>
            <SelectMenuFixed
              v-model="hideoutDefaultView"
              :items="hideoutViewOptions"
              value-key="value"
              label-key="label"
            />
          </div>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';

  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();

  const showRequiredLabels = computed({
    get: () => preferencesStore.getShowRequiredLabels,
    set: (val) => preferencesStore.setShowRequiredLabels(val),
  });
  const showExperienceRewards = computed({
    get: () => preferencesStore.getShowExperienceRewards,
    set: (val) => preferencesStore.setShowExperienceRewards(val),
  });
  const showNextQuests = computed({
    get: () => preferencesStore.getShowNextQuests,
    set: (val) => preferencesStore.setShowNextQuests(val),
  });
  const showPreviousQuests = computed({
    get: () => preferencesStore.getShowPreviousQuests,
    set: (val) => preferencesStore.setShowPreviousQuests(val),
  });
  const taskCardDensity = computed({
    get: () => preferencesStore.getTaskCardDensity,
    set: (val) => preferencesStore.setTaskCardDensity(val),
  });
  const densityOptions = computed(() => [
    { label: t('settings.density.compact'), value: 'compact' },
    { label: t('settings.density.comfortable'), value: 'comfortable' },
  ]);
  const taskDefaultView = computed({
    get: () => preferencesStore.getTaskPrimaryView,
    set: (val) => preferencesStore.setTaskPrimaryView(val),
  });
  const taskViewOptions = computed(() => [
    { label: t('tasks.view.all'), value: 'all' },
    { label: t('tasks.view.map'), value: 'maps' },
    { label: t('tasks.view.traders'), value: 'traders' },
  ]);
  const hideoutDefaultView = computed({
    get: () => preferencesStore.getHideoutPrimaryView,
    set: (val) => preferencesStore.setHideoutPrimaryView(val),
  });
  const hideoutViewOptions = computed(() => [
    { label: t('hideout.view.available'), value: 'available' },
    { label: t('hideout.view.all'), value: 'all' },
    { label: t('hideout.view.maxed'), value: 'maxed' },
    { label: t('hideout.view.locked'), value: 'locked' },
  ]);
</script>
```

**Step 2: Verify the component renders**

Run: `npx vitest run --reporter=verbose 2>&1 | head -30`
Expected: No import errors related to TaskDisplayCard

**Step 3: Commit**

```bash
git add app/features/settings/TaskDisplayCard.vue
git commit -m "feat(settings): create TaskDisplayCard component"
```

---

### Task 2: Create MapSettingsCard Component

**Files:**

- Create: `app/features/settings/MapSettingsCard.vue`

**Step 1: Create the MapSettingsCard component**

Extract the "Maps" section from InterfaceSettingsCard. This card handles: show extracts toggle, zoom/pan speed sliders, and marker color picker.

```vue
<template>
  <GenericCard
    icon="mdi-map"
    icon-color="success"
    highlight-color="success"
    :fill-height="false"
    :title="$t('settings.interface.maps.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <div class="grid gap-4 md:grid-cols-3">
          <UCheckbox
            v-model="showMapExtracts"
            :label="$t('settings.interface.maps.show_extracts')"
          />
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-sm font-medium">
                {{ $t('settings.interface.maps.zoom_speed') }}
              </span>
              <span class="text-surface-200 text-xs">{{ mapZoomSpeed }}x</span>
            </div>
            <input
              v-model.number="mapZoomSpeed"
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              class="bg-surface-700 accent-surface-200 h-2 w-full cursor-pointer appearance-none rounded-lg"
            />
          </div>
          <div class="space-y-1">
            <div class="flex justify-between">
              <span class="text-sm font-medium">
                {{ $t('settings.interface.maps.pan_speed') }}
              </span>
              <span class="text-surface-200 text-xs">{{ mapPanSpeed.toFixed(1) }}x</span>
            </div>
            <input
              v-model.number="mapPanSpeed"
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              class="bg-surface-700 accent-surface-200 h-2 w-full cursor-pointer appearance-none rounded-lg"
            />
          </div>
        </div>
        <div class="bg-surface-800/50 border-surface-700 space-y-3 rounded-lg border p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="space-y-0.5">
              <p class="text-surface-200 text-sm font-medium">
                {{ $t('settings.interface.maps.colors.title') }}
              </p>
              <p class="text-surface-400 text-xs">
                {{ $t('settings.interface.maps.colors.description') }}
              </p>
            </div>
            <UButton
              color="neutral"
              size="xs"
              variant="ghost"
              @click="preferencesStore.resetMapMarkerColors()"
            >
              {{ $t('settings.interface.maps.colors.reset') }}
            </UButton>
          </div>
          <div class="grid gap-2 md:grid-cols-2">
            <label
              v-for="option in mapColorOptions"
              :key="option.key"
              class="bg-surface-900/40 border-surface-700 flex items-center justify-between gap-3 rounded-md border px-2.5 py-2"
            >
              <span class="flex items-center gap-2">
                <span
                  class="h-3.5 w-3.5 rounded-full border border-white/30"
                  :style="{ backgroundColor: mapMarkerColors[option.key] }"
                />
                <span class="text-surface-200 text-xs font-medium">
                  {{ option.label }}
                </span>
              </span>
              <input
                :aria-label="option.label"
                :value="mapMarkerColors[option.key]"
                type="color"
                class="bg-surface-900 border-surface-700 h-8 w-11 cursor-pointer rounded border p-1"
                @input="onMapColorInput(option.key, $event)"
              />
            </label>
          </div>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { getMapColorOptions, type MapMarkerColorKey } from '@/utils/theme-colors';

  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();

  const showMapExtracts = computed({
    get: () => preferencesStore.getShowMapExtracts,
    set: (val) => preferencesStore.setShowMapExtracts(val),
  });
  const mapZoomSpeed = computed({
    get: () => preferencesStore.getMapZoomSpeed,
    set: (val) => preferencesStore.setMapZoomSpeed(val),
  });
  const mapPanSpeed = computed({
    get: () => preferencesStore.getMapPanSpeed,
    set: (val) => preferencesStore.setMapPanSpeed(val),
  });
  const mapMarkerColors = computed(() => preferencesStore.getMapMarkerColors);
  const mapColorOptions = computed(() => getMapColorOptions(t));
  const onMapColorInput = (key: MapMarkerColorKey, event: Event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    preferencesStore.setMapMarkerColor(key, input.value);
  };
</script>
```

**Step 2: Commit**

```bash
git add app/features/settings/MapSettingsCard.vue
git commit -m "feat(settings): create MapSettingsCard component"
```

---

### Task 3: Create PrivacyCard Component

**Files:**

- Create: `app/features/settings/PrivacyCard.vue`

**Step 1: Create the PrivacyCard component**

Extract the "Miscellaneous" privacy toggle section from InterfaceSettingsCard.

```vue
<template>
  <GenericCard
    icon="mdi-eye-off"
    icon-color="warning"
    highlight-color="warning"
    :fill-height="false"
    :title="$t('settings.general.privacy_mode')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="px-4 py-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-surface-400 text-sm">
            {{ $t('settings.general.privacy_mode_hint') }}
          </p>
          <USwitch
            :model-value="streamerMode"
            :disabled="!isLoggedIn || streamerModeCooldown"
            :ui="{
              base: 'data-[state=unchecked]:bg-error-500 data-[state=checked]:bg-success-500',
            }"
            @update:model-value="handleStreamerModeToggle"
          />
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { SupabaseUser } from '@/types/supabase-plugin';

  const preferencesStore = usePreferencesStore();
  const { $supabase } = useNuxtApp();

  const typedUser = computed<SupabaseUser | null>(() => {
    const supabase = $supabase as { user?: SupabaseUser } | undefined;
    return supabase?.user ?? null;
  });

  const isLoggedIn = computed(() => Boolean(typedUser.value?.loggedIn));
  const streamerModeCooldown = ref(false);
  let streamerModeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const streamerMode = computed(() => preferencesStore.getStreamerMode);

  const handleStreamerModeToggle = (newValue: boolean) => {
    if (streamerModeCooldown.value) return;
    preferencesStore.setStreamerMode(newValue);
    streamerModeCooldown.value = true;
    streamerModeTimeoutId = setTimeout(() => {
      streamerModeCooldown.value = false;
      streamerModeTimeoutId = null;
    }, 500);
  };

  onUnmounted(() => {
    if (streamerModeTimeoutId) {
      clearTimeout(streamerModeTimeoutId);
      streamerModeTimeoutId = null;
    }
  });
</script>
```

**Step 2: Commit**

```bash
git add app/features/settings/PrivacyCard.vue
git commit -m "feat(settings): create PrivacyCard component"
```

---

### Task 4: Rewrite the Settings Page

**Files:**

- Modify: `app/pages/settings.vue`

**Step 1: Replace the settings page template and script**

Remove the `<UAlert>` banner, `<UTabs>` wrapper, and inline Game Settings / API Tokens card markup. Replace with a vertical flow of focused card components. Narrow from `max-w-[1400px]` to `max-w-3xl`.

The new page imports and renders all 7 cards in order:

1. ExperienceCard
2. Game Profile card (inline — edition + prestige dropdowns)
3. TaskDisplayCard (new)
4. MapSettingsCard (new)
5. SkillsCard
6. PrivacyCard (new)
7. API Tokens card (inline with GenericCard wrapper)

```vue
<template>
  <div class="px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-3xl space-y-4">
      <ExperienceCard />
      <GenericCard
        icon="mdi-gamepad-variant"
        icon-color="accent"
        highlight-color="accent"
        :fill-height="false"
        :title="$t('settings.game_settings.title')"
        title-classes="text-lg font-semibold"
      >
        <template #content>
          <div class="grid gap-4 px-4 py-4 md:grid-cols-2">
            <div class="space-y-2">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.game_profile.game_edition') }}
              </p>
              <SelectMenuFixed
                v-model="selectedGameEdition"
                :items="gameEditionOptions"
                value-key="value"
              >
                <template #leading>
                  <UIcon name="i-mdi-gift-open" class="text-surface-300 h-4 w-4" />
                </template>
              </SelectMenuFixed>
            </div>
            <div class="space-y-2">
              <p class="text-surface-200 text-sm font-semibold">
                {{ $t('settings.prestige.current_level') }}
              </p>
              <SelectMenuFixed
                v-model="currentPrestige"
                :items="prestigeOptions"
                value-key="value"
                :disabled="isPveMode"
              >
                <template #leading>
                  <UIcon
                    name="i-mdi-trophy"
                    class="text-warning-400 h-4 w-4"
                    :class="{ 'opacity-50': isPveMode }"
                  />
                </template>
              </SelectMenuFixed>
            </div>
          </div>
        </template>
      </GenericCard>
      <TaskDisplayCard />
      <MapSettingsCard />
      <SkillsCard />
      <PrivacyCard />
      <GenericCard
        icon="mdi-key-chain"
        icon-color="secondary"
        highlight-color="secondary"
        :fill-height="false"
        :title="$t('page.settings.card.apitokens.title')"
        title-classes="text-lg font-semibold"
      >
        <template #content>
          <div class="relative px-4 py-4">
            <ApiTokens v-if="isLoggedIn" />
            <UAlert
              v-else
              color="warning"
              variant="soft"
              icon="i-mdi-lock"
              :title="$t('page.settings.card.apitokens.not_logged_in')"
            />
          </div>
        </template>
      </GenericCard>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import ApiTokens from '@/features/settings/ApiTokens.vue';
  import ExperienceCard from '@/features/settings/ExperienceCard.vue';
  import MapSettingsCard from '@/features/settings/MapSettingsCard.vue';
  import PrivacyCard from '@/features/settings/PrivacyCard.vue';
  import SkillsCard from '@/features/settings/SkillsCard.vue';
  import TaskDisplayCard from '@/features/settings/TaskDisplayCard.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES } from '@/utils/constants';

  useSeoMeta({
    title: 'Settings',
    description:
      'Customize your TarkovTracker experience. Manage preferences and gameplay settings.',
    robots: 'noindex, nofollow',
  });

  const { t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const metadataStore = useMetadataStore();
  const tarkovStore = useTarkovStore();

  const isLoggedIn = computed(() => Boolean($supabase?.user?.loggedIn));
  const isPveMode = computed(() => tarkovStore.getCurrentGameMode() === GAME_MODES.PVE);

  const gameEditionOptions = computed(() =>
    metadataStore.editions.map((edition) => ({
      label: edition.title,
      value: edition.value,
    }))
  );
  const selectedGameEdition = computed({
    get(): number {
      return tarkovStore.getGameEdition() || 1;
    },
    set(newValue: number) {
      tarkovStore.setGameEdition(newValue || 1);
    },
  });
  const prestigeOptions = computed(() =>
    Array.from({ length: 7 }, (_, i) => ({
      label: i === 0 ? t('prestige.no_prestige') : t('prestige.prestige_n', { n: i }),
      value: i,
    }))
  );
  const currentPrestige = computed({
    get: () => (isPveMode.value ? 0 : tarkovStore.getPrestigeLevel()),
    set: (newValue: number) => {
      if (!isPveMode.value) {
        tarkovStore.setPrestigeLevel(newValue);
      }
    },
  });
</script>
```

**Step 2: Commit**

```bash
git add app/pages/settings.vue
git commit -m "feat(settings): rewrite page as vertical card flow"
```

---

### Task 5: Update the Settings Page Tests

**Files:**

- Modify: `app/pages/__tests__/settings.page.test.ts`

**Step 1: Update test stubs and assertions**

The tests need updating because:

- `UTabs` is removed (no more slot-based rendering)
- `InterfaceSettingsCard` is replaced by `TaskDisplayCard`, `MapSettingsCard`, `PrivacyCard`
- The streamer mode test now needs to find the PrivacyCard stub

Update the `defaultGlobalStubs` to replace `InterfaceSettingsCard` with the three new card stubs, and remove the `UTabs` stub. Update the streamer mode test to target the PrivacyCard stub.

Key changes to stubs:

```typescript
// Remove these:
// InterfaceSettingsCard: { ... }
// UTabs: { ... }

// Add these:
TaskDisplayCard: true,
MapSettingsCard: true,
PrivacyCard: {
  template:
    '<div data-testid="privacy-card"><input type="checkbox" data-testid="privacy-card-switch" /></div>',
},
```

Update streamer mode test to use `[data-testid="privacy-card-switch"]` instead of `[data-testid="interface-settings-card-switch"]`.

**Step 2: Run tests to verify they pass**

Run: `npx vitest run app/pages/__tests__/settings.page.test.ts --reporter=verbose`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add app/pages/__tests__/settings.page.test.ts
git commit -m "test(settings): update tests for new card-based layout"
```

---

### Task 6: Remove the Old InterfaceSettingsCard

**Files:**

- Delete: `app/features/settings/InterfaceSettingsCard.vue`

**Step 1: Verify no remaining imports of InterfaceSettingsCard**

Run: `grep -r "InterfaceSettingsCard" app/ --include="*.vue" --include="*.ts"`
Expected: No results (the old settings.vue import is already gone)

**Step 2: Delete the file**

```bash
rm app/features/settings/InterfaceSettingsCard.vue
```

**Step 3: Run all tests to verify nothing is broken**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add -u app/features/settings/InterfaceSettingsCard.vue
git commit -m "refactor(settings): remove old InterfaceSettingsCard"
```

---

### Task 7: Clean Up Locale Keys

**Files:**

- Modify: `app/locales/en.json5` (and all other locale files)

**Step 1: Remove the `ui_notice` keys from all locale files**

The `settings.ui_notice.title` and `settings.ui_notice.description` keys are no longer used since the alert banner was removed. Remove these from all locale files: `en.json5`, `de.json5`, `es.json5`, `fr.json5`, `ru.json5`, `uk.json5`, `zh.json5`.

**Step 2: Verify no references remain**

Run: `grep -r "ui_notice" app/ --include="*.vue" --include="*.ts"`
Expected: No results

**Step 3: Run format**

Run: `npm run format`
Expected: Clean formatting

**Step 4: Commit**

```bash
git add app/locales/*.json5
git commit -m "chore(i18n): remove unused ui_notice locale keys"
```

---

### Task 8: Final Verification

**Step 1: Run all tests**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 2: Run format and lint**

Run: `npm run format`
Expected: No errors

**Step 3: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors
