<template>
  <TeamCard
    :title="$t('page.team.visibility.title')"
    :subtitle="$t('page.team.visibility.description')"
  >
    <template #icon>
      <UIcon name="i-mdi-eye-settings-outline" class="text-primary-300 h-5 w-5" />
    </template>
    <div class="space-y-5">
      <div class="space-y-3">
        <h3 class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
          {{ $t('common.tasks') }}
        </h3>
        <label
          for="team-visibility-tasks"
          class="bg-surface-800/50 border-surface-700 hover:border-surface-600 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-200"
          data-testid="task-row"
        >
          <span class="text-surface-200 text-sm font-medium" data-testid="task-toggle">
            {{ $t('page.team.visibility.show_tasks') }}
          </span>
          <TeamVisibilitySwitch
            id="team-visibility-tasks"
            v-model="showTasks"
            data-testid="task-switch"
            :label="$t('page.team.visibility.show_tasks')"
          />
        </label>
      </div>
      <div class="space-y-3">
        <h3 class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
          {{ $t('page.team.visibility.items_section') }}
        </h3>
        <div class="space-y-2">
          <label
            for="team-visibility-items"
            class="bg-surface-800/50 border-surface-700 hover:border-surface-600 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-200"
            data-testid="items-row"
          >
            <span class="text-surface-200 text-sm font-medium">
              {{ $t('page.team.visibility.show_items') }}
            </span>
            <TeamVisibilitySwitch
              id="team-visibility-items"
              v-model="showItems"
              data-testid="items-switch"
              :label="$t('page.team.visibility.show_items')"
            />
          </label>
          <label
            for="team-visibility-non-fir"
            class="bg-surface-800/50 border-surface-700 flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-200"
            :class="{
              'hover:border-surface-600 cursor-pointer': !itemsHideAll,
              'cursor-not-allowed opacity-50': itemsHideAll,
            }"
            data-testid="nonfir-row"
          >
            <span class="text-surface-200 text-sm font-medium">
              {{ $t('page.team.visibility.show_non_fir') }}
            </span>
            <TeamVisibilitySwitch
              id="team-visibility-non-fir"
              v-model="showNonFIR"
              :disabled="itemsHideAll"
              data-testid="nonfir-switch"
              :label="$t('page.team.visibility.show_non_fir')"
            />
          </label>
          <label
            for="team-visibility-hideout"
            class="bg-surface-800/50 border-surface-700 flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-200"
            :class="{
              'hover:border-surface-600 cursor-pointer': !itemsHideAll,
              'cursor-not-allowed opacity-50': itemsHideAll,
            }"
            data-testid="hideout-row"
          >
            <span class="text-surface-200 text-sm font-medium">
              {{ $t('page.team.visibility.show_hideout') }}
            </span>
            <TeamVisibilitySwitch
              id="team-visibility-hideout"
              v-model="showHideout"
              :disabled="itemsHideAll"
              data-testid="hideout-switch"
              :label="$t('page.team.visibility.show_hideout')"
            />
          </label>
        </div>
      </div>
      <div class="space-y-3">
        <h3 class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
          {{ $t('common.maps') }}
        </h3>
        <label
          for="team-visibility-maps"
          class="bg-surface-800/50 border-surface-700 hover:border-surface-600 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors duration-200"
          data-testid="map-row"
        >
          <span class="text-surface-200 text-sm font-medium">
            {{ $t('page.team.visibility.show_maps') }}
          </span>
          <TeamVisibilitySwitch
            id="team-visibility-maps"
            v-model="showMaps"
            data-testid="map-switch"
            :label="$t('page.team.visibility.show_maps')"
          />
        </label>
      </div>
    </div>
  </TeamCard>
</template>
<script setup lang="ts">
  import TeamCard from '@/features/team/TeamCard.vue';
  import TeamVisibilitySwitch from '@/features/team/TeamVisibilitySwitch.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  const preferencesStore = usePreferencesStore();
  const showTasks = computed({
    get: () => !preferencesStore.taskTeamAllHidden,
    set: (value: boolean) => preferencesStore.setQuestTeamHideAll(!value),
  });
  const showItems = computed({
    get: () => !preferencesStore.itemsTeamAllHidden,
    set: (value: boolean) => preferencesStore.setItemsTeamHideAll(!value),
  });
  const itemsHideAll = computed(() => preferencesStore.itemsTeamAllHidden);
  const showNonFIR = computed({
    get: () => !preferencesStore.itemsTeamNonFIRHidden,
    set: (value: boolean) => preferencesStore.setItemsTeamHideNonFIR(!value),
  });
  const showHideout = computed({
    get: () => !preferencesStore.itemsTeamHideoutHidden,
    set: (value: boolean) => preferencesStore.setItemsTeamHideHideout(!value),
  });
  const showMaps = computed({
    get: () => !preferencesStore.mapTeamAllHidden,
    set: (value: boolean) => preferencesStore.setMapTeamHideAll(!value),
  });
</script>
