<template>
  <div
    data-testid="map-raid-plan"
    class="bg-surface-900/50 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/8 px-3 py-2"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <UIcon name="i-mdi-crosshairs" class="text-primary-300 h-4 w-4 shrink-0" aria-hidden="true" />
      <span class="text-surface-100 text-sm font-medium">
        {{ t('page.tasks.map.raid_plan.title') }}
      </span>
      <span data-testid="map-raid-plan-summary" class="text-surface-400 truncate text-xs">
        {{ summaryText }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <UButton
        v-if="hasUserState"
        data-testid="map-raid-plan-show-all"
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-mdi-eye-refresh-outline"
        @click="showAll"
      >
        {{ t('page.tasks.map.raid_plan.show_all') }}
      </UButton>
      <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 8 }">
        <UButton
          data-testid="map-raid-plan-choose"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-mdi-format-list-checks"
          :disabled="tasks.length === 0"
        >
          {{ t('page.tasks.map.raid_plan.choose_quests') }}
        </UButton>
        <template #content>
          <div class="w-80 max-w-full p-3 sm:w-96">
            <p class="text-surface-400 mb-2 text-xs">
              {{ t('page.tasks.map.raid_plan.popover_description') }}
            </p>
            <p v-if="tasks.length === 0" class="text-surface-400 text-xs">
              {{ t('page.tasks.map.raid_plan.empty') }}
            </p>
            <ul v-else class="max-h-80 space-y-1 overflow-y-auto pr-1">
              <li
                v-for="row in rows"
                :key="row.task.id"
                data-testid="map-raid-plan-row"
                class="flex items-center gap-2 rounded-md px-1.5 py-1"
                :class="row.rowClass"
              >
                <span class="min-w-0 flex-1">
                  <span class="text-surface-100 block truncate text-xs font-medium">
                    {{ row.task.name }}
                  </span>
                  <span v-if="row.statusLabel" class="text-surface-500 block text-[11px]">
                    {{ row.statusLabel }}
                  </span>
                </span>
                <TaskMapVisibilityToggles :task-id="row.task.id" />
              </li>
            </ul>
          </div>
        </template>
      </UPopover>
    </div>
    <p
      v-if="allHidden"
      data-testid="map-raid-plan-all-hidden"
      class="text-warning-300 w-full text-xs"
      role="status"
    >
      {{ t('page.tasks.map.raid_plan.all_hidden_hint') }}
    </p>
  </div>
</template>
<script setup lang="ts">
  import {
    getMapTaskUserVisibility,
    type MapTaskUserVisibility,
    type MapTaskVisibilityState,
  } from '@/features/maps/utils/mapTaskVisibility';
  import TaskMapVisibilityToggles from '@/features/tasks/TaskMapVisibilityToggles.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    tasks: Task[];
    state: MapTaskVisibilityState;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const STATUS_LABEL_KEYS: Record<MapTaskUserVisibility, string | null> = {
    visible: null,
    hidden: 'page.tasks.map.raid_plan.status_hidden',
    unfocused: 'page.tasks.map.raid_plan.status_unfocused',
  };
  const rows = computed(() =>
    props.tasks.map((task) => {
      const visibility = getMapTaskUserVisibility(task.id, props.state);
      const statusKey = STATUS_LABEL_KEYS[visibility];
      return {
        task,
        isShown: visibility === 'visible',
        rowClass: visibility === 'visible' ? '' : 'opacity-60',
        statusLabel: statusKey ? t(statusKey) : '',
      };
    })
  );
  const shownCount = computed(() => rows.value.filter((row) => row.isShown).length);
  const hasUserState = computed(() =>
    props.tasks.some(
      (task) =>
        props.state.activeFocusTaskIds.has(task.id) || props.state.hiddenTaskIds.has(task.id)
    )
  );
  const allHidden = computed(() => rows.value.length > 0 && shownCount.value === 0);
  const summaryText = computed(() => {
    const params = { shown: shownCount.value, total: rows.value.length };
    if (props.state.activeFocusTaskIds.size > 0) {
      return t('page.tasks.map.raid_plan.summary_focus', params);
    }
    if (shownCount.value < rows.value.length) {
      return t('page.tasks.map.raid_plan.summary_hidden', params);
    }
    return t('page.tasks.map.raid_plan.summary_all', params);
  });
  const showAll = () => {
    preferencesStore.clearMapTaskVisibility(props.tasks.map((task) => task.id));
  };
</script>
