<template>
  <div class="flex min-h-full overflow-x-hidden">
    <div class="min-w-0 flex-1 px-3 py-6 sm:px-6">
      <div class="mx-auto max-w-[1200px]">
        <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex items-center gap-3">
            <span
              class="bg-primary-500/15 border-primary-500/25 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
            >
              <UIcon name="i-heroicons-sparkles" class="text-primary-300 h-6 w-6" />
            </span>
            <div>
              <h1 class="text-surface-100 text-2xl font-bold tracking-tight">
                {{ t('page.season_planner.title') }}
              </h1>
              <p class="text-surface-400 text-sm">
                {{ t('page.season_planner.description') }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="bg-surface-800 border-surface-700 flex items-center gap-3 rounded-lg border px-4 py-2"
            >
              <span class="text-surface-300 text-sm font-medium">
                {{ t('page.season_planner.total_points') }}
              </span>
              <span
                :class="plannerStore.isValid ? 'text-primary-400' : 'text-red-400'"
                class="text-xl font-bold tabular-nums"
              >
                {{ plannerStore.totalPoints > 0 ? '+' : '' }}{{ plannerStore.totalPoints }}
              </span>
            </div>
            <UButton color="neutral" variant="soft" @click="plannerStore.reset()">
              {{ t('page.season_planner.reset') }}
            </UButton>
          </div>
        </div>
        <div v-if="!plannerStore.isValid" class="mb-6">
          <UAlert
            icon="i-heroicons-exclamation-triangle"
            color="error"
            variant="soft"
            :title="t('page.season_planner.invalid_total_title')"
            :description="t('page.season_planner.invalid_total_description')"
          />
        </div>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <!-- Positive Modifiers -->
          <div class="lg:col-span-1">
            <h2 class="text-surface-100 mb-4 flex items-center gap-2 text-lg font-semibold">
              <UIcon name="i-heroicons-plus-circle" class="text-primary-400 h-5 w-5" />
              {{ t('page.season_planner.positive_modifiers') }}
            </h2>
            <div class="space-y-3">
              <ModifierCard
                v-for="modifier in positiveModifiers"
                :key="modifier.id"
                :modifier="modifier"
                :selected="plannerStore.selectedModifiers.includes(modifier.id)"
                @toggle="plannerStore.toggleModifier(modifier.id)"
              />
            </div>
          </div>
          <!-- Negative Modifiers -->
          <div class="lg:col-span-1">
            <h2 class="text-surface-100 mb-4 flex items-center gap-2 text-lg font-semibold">
              <UIcon name="i-heroicons-minus-circle" class="h-5 w-5 text-red-400" />
              {{ t('page.season_planner.negative_modifiers') }}
            </h2>
            <div class="space-y-3">
              <ModifierCard
                v-for="modifier in negativeModifiers"
                :key="modifier.id"
                :modifier="modifier"
                :selected="plannerStore.selectedModifiers.includes(modifier.id)"
                @toggle="plannerStore.toggleModifier(modifier.id)"
              />
            </div>
          </div>
          <!-- Hardcore Modifiers -->
          <div class="lg:col-span-1">
            <h2 class="text-surface-100 mb-4 flex items-center gap-2 text-lg font-semibold">
              <UIcon name="i-heroicons-fire" class="h-5 w-5 text-orange-400" />
              {{ t('page.season_planner.hardcore_modifiers') }}
            </h2>
            <div class="bg-surface-800/50 border-surface-700 rounded-lg border p-4">
              <p class="text-surface-400 mb-4 text-sm italic">
                {{ t('page.season_planner.hardcore_description') }}
              </p>
              <div class="space-y-3">
                <div
                  v-for="modifier in hardcoreModifiers"
                  :key="modifier.id"
                  class="bg-surface-900/50 border-surface-700 flex flex-col gap-1 rounded-md border p-3"
                >
                  <span class="text-surface-100 text-sm font-semibold">{{ modifier.name }}</span>
                  <span class="text-surface-400 text-xs">{{ modifier.description }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import ModifierCard from '@/features/season-planner/ModifierCard.vue';
  import { useSeasonPlannerStore } from '@/stores/useSeasonPlanner';
  const { t } = useI18n({ useScope: 'global' });
  useSeoMeta({
    title: 'Season Planner - Kord Breach',
    description:
      'Plan your Escape from Tarkov Kord Breach seasonal character modifiers and point balance.',
  });
  const plannerStore = useSeasonPlannerStore();
  const positiveModifiers = computed(() =>
    plannerStore.allModifiers.filter((m) => m.type === 'positive')
  );
  const negativeModifiers = computed(() =>
    plannerStore.allModifiers.filter((m) => m.type === 'negative')
  );
  const hardcoreModifiers = computed(() =>
    plannerStore.allModifiers.filter((m) => m.type === 'hardcore')
  );
</script>
