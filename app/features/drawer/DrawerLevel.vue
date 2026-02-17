<template>
  <div class="flex items-center justify-center px-3 py-2">
    <template v-if="isCollapsed">
      <div class="text-center">
        <div class="text-surface-400 mb-1 text-[0.7em]">
          {{ t('navigation_drawer.level') }}
        </div>
        <span class="text-center text-2xl leading-tight font-bold">
          {{ displayedLevel }}
        </span>
      </div>
    </template>
    <template v-else>
      <div class="w-full">
        <div class="flex min-w-0 items-center gap-2.5 rounded-md bg-white/5 px-2.5 py-2">
          <span class="shrink-0 leading-none">
            <div class="relative h-11 w-11 overflow-hidden">
              <template v-if="isDataReady && groupIcon">
                <NuxtImg
                  v-if="!groupImageLoadFailed"
                  :src="groupIcon"
                  class="max-w-11"
                  width="44"
                  height="44"
                  @error="handleGroupImageError"
                />
                <div v-else class="flex h-11 w-11 items-center justify-center rounded bg-white/5">
                  <UIcon name="i-heroicons-photo" class="text-surface-600 h-5 w-5" />
                </div>
              </template>
              <template v-else>
                <div class="flex h-11 w-11 items-center justify-center rounded bg-white/5">
                  <UIcon
                    name="i-heroicons-arrow-path"
                    class="text-surface-500 h-5 w-5 animate-spin"
                  />
                </div>
              </template>
            </div>
          </span>
          <span class="min-w-0 flex-1">
            <div
              class="text-surface-400 mb-0.5 flex items-center justify-center gap-1 text-[0.6rem]"
            >
              <span>{{ t('navigation_drawer.level') }}</span>
              <span class="text-surface-500 text-[0.5rem]">·</span>
              <span
                class="text-[0.55rem]"
                :class="useAutomaticLevel ? 'text-accent-400' : 'text-surface-500'"
              >
                {{
                  useAutomaticLevel
                    ? t('navigation_drawer.mode_auto')
                    : t('navigation_drawer.mode_manual')
                }}
              </span>
            </div>
            <div class="flex h-8 items-center justify-center text-center">
              <AppTooltip
                v-if="!editingLevel || useAutomaticLevel"
                :text="useAutomaticLevel ? t('navigation_drawer.auto_level_enabled') : ''"
              >
                <span
                  :class="
                    useAutomaticLevel
                      ? 'mx-auto block h-8 w-12 text-center text-3xl leading-8 font-bold'
                      : 'hover:text-primary mx-auto block h-8 w-12 cursor-pointer text-center text-3xl leading-8 font-bold transition-colors'
                  "
                  :tabindex="useAutomaticLevel ? '-1' : '0'"
                  :role="useAutomaticLevel ? undefined : 'button'"
                  :aria-disabled="useAutomaticLevel ? 'true' : undefined"
                  :aria-label="
                    useAutomaticLevel
                      ? t(
                          'navigation_drawer.level_display_auto',
                          { level: displayedLevel },
                          'Level {level} (automatic calculation enabled)'
                        )
                      : t(
                          'navigation_drawer.level_display_editable',
                          { level: displayedLevel },
                          'Level {level}, click or press Enter to edit'
                        )
                  "
                  @click="!useAutomaticLevel && startEditingLevel()"
                  @keydown.enter="!useAutomaticLevel && startEditingLevel()"
                  @keydown.space.prevent="!useAutomaticLevel && startEditingLevel()"
                >
                  {{ displayedLevel }}
                </span>
              </AppTooltip>
              <input
                v-else
                ref="levelInput"
                v-model.number="levelInputValue"
                type="number"
                :min="minPlayerLevel"
                :max="maxPlayerLevel"
                class="no-spinner mx-auto block h-8 w-12 border-0 bg-transparent p-0 text-center text-3xl leading-8 font-bold outline-none focus:ring-0"
                @input="enforceMaxLevel"
                @blur="saveLevel"
                @keyup.enter="saveLevel"
              />
            </div>
          </span>
          <span
            v-if="!useAutomaticLevel"
            class="flex shrink-0 flex-col overflow-hidden rounded-md border border-white/10 bg-white/5"
          >
            <button
              :class="[STEPPER_BUTTON_CLASS, 'border-b border-white/10']"
              :disabled="displayedLevel >= maxPlayerLevel"
              :aria-label="t('navigation_drawer.increment_level')"
              @click="incrementLevel"
            >
              <UIcon name="i-heroicons-plus" class="h-3.5 w-3.5" />
            </button>
            <button
              :class="STEPPER_BUTTON_CLASS"
              :disabled="displayedLevel <= minPlayerLevel"
              :aria-label="t('navigation_drawer.decrement_level')"
              @click="decrementLevel"
            >
              <UIcon name="i-heroicons-minus" class="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        <NuxtLink
          v-if="useAutomaticLevel"
          to="/settings"
          class="hover:border-surface-600 mt-1.5 block cursor-pointer rounded border border-white/5 bg-white/5 px-2 py-1 no-underline transition-all hover:bg-white/10"
          :aria-label="t('navigation_drawer.xp_settings_link')"
        >
          <div class="mb-0.5 flex items-center justify-between text-[0.6rem]">
            <span class="text-surface-400">{{ formatNumber(xpCalculation.totalXP.value) }} XP</span>
            <span class="text-surface-500">
              {{ formatNumber(xpCalculation.xpToNextLevel.value) }} needed
            </span>
          </div>
          <div class="bg-surface-800/35 h-2 overflow-hidden rounded-full">
            <div
              class="bg-primary-500/60 h-full rounded-full transition-[width] duration-300 ease-out"
              :style="{ width: `${xpCalculation.xpProgress.value}%` }"
              role="progressbar"
              :aria-valuenow="Math.round(xpCalculation.xpProgress.value)"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="t('navigation_drawer.xp_progress')"
            ></div>
          </div>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import { useXpCalculation } from '@/composables/useXpCalculation';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import { logger } from '@/utils/logger';
  import type { PlayerLevel } from '@/types/tarkov';
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  interface DrawerLevelProps {
    isCollapsed: boolean;
  }
  defineProps<DrawerLevelProps>();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const xpCalculation = useXpCalculation();
  const minPlayerLevel = computed<number>(() => metadataStore.minPlayerLevel);
  const maxPlayerLevel = computed<number>(() => metadataStore.maxPlayerLevel);
  const playerLevels = computed<PlayerLevel[]>(() => metadataStore.playerLevels);
  const useAutomaticLevel = computed<boolean>(
    () => preferencesStore.getUseAutomaticLevelCalculation
  );
  const STEPPER_BUTTON_CLASS =
    'flex h-5.5 w-5.5 items-center justify-center p-0 text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';
  const displayedLevel = computed<number>(() => {
    return useAutomaticLevel.value ? xpCalculation.derivedLevel.value : tarkovStore.playerLevel();
  });
  const isDataReady = computed<boolean>(() => {
    return !metadataStore.loading && metadataStore.playerLevels.length > 0;
  });
  const groupIcon = computed<string>(() => {
    const level = displayedLevel.value;
    const entry = playerLevels.value.find((pl) => pl.level === level);
    return entry?.levelBadgeImageLink ?? '';
  });
  const groupImageLoadFailed = ref<boolean>(false);
  const editingLevel = ref<boolean>(false);
  const levelInputValue = ref<number>(tarkovStore.playerLevel());
  const levelInput = ref<HTMLInputElement | null>(null);
  function startEditingLevel(): void {
    editingLevel.value = true;
    levelInputValue.value = tarkovStore.playerLevel();
    void nextTick(() => {
      levelInput.value?.focus();
    });
  }
  function enforceMaxLevel(): void {
    const currentValue = Number(levelInputValue.value);
    if (Number.isFinite(currentValue) && currentValue > maxPlayerLevel.value) {
      levelInputValue.value = maxPlayerLevel.value;
    }
  }
  function saveLevel(): void {
    let newLevel = Number(levelInputValue.value);
    if (!Number.isFinite(newLevel)) newLevel = minPlayerLevel.value;
    newLevel = Math.max(minPlayerLevel.value, Math.min(maxPlayerLevel.value, newLevel));
    tarkovStore.setLevel(newLevel);
    editingLevel.value = false;
  }
  function incrementLevel(): void {
    if (tarkovStore.playerLevel() < maxPlayerLevel.value) {
      tarkovStore.setLevel(tarkovStore.playerLevel() + 1);
    }
  }
  function decrementLevel(): void {
    if (tarkovStore.playerLevel() > minPlayerLevel.value) {
      tarkovStore.setLevel(tarkovStore.playerLevel() - 1);
    }
  }
  watch(groupIcon, () => {
    groupImageLoadFailed.value = false;
  });
  function handleGroupImageError(event: string | Event): void {
    const src = typeof event === 'string' ? event : (event.target as HTMLImageElement | null)?.src;
    logger.warn('Failed to load group image', { src });
    groupImageLoadFailed.value = true;
  }
</script>
