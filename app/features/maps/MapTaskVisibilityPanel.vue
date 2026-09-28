<template>
  <div
    data-testid="map-raid-plan"
    class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 transition-colors"
    :class="
      hiddenCount > 0
        ? 'border-warning-500/40 bg-warning-500/10'
        : 'bg-surface-900/50 border-white/8'
    "
  >
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <UIcon
        :name="hiddenCount > 0 ? 'i-mdi-eye-off-outline' : 'i-mdi-map-marker-multiple-outline'"
        class="h-4 w-4 shrink-0"
        :class="hiddenCount > 0 ? 'text-warning-300' : 'text-primary-300'"
        aria-hidden="true"
      />
      <span class="text-surface-100 text-sm font-medium">
        {{ t('page.tasks.map.raid_plan.title') }}
      </span>
      <span
        data-testid="map-raid-plan-summary"
        class="truncate text-xs"
        :class="hiddenCount > 0 ? 'text-warning-200' : 'text-surface-400'"
      >
        {{ summaryText }}
      </span>
    </div>
    <div class="flex items-center gap-2">
      <UButton
        v-if="hiddenCount > 0"
        data-testid="map-raid-plan-show-all"
        size="xs"
        color="warning"
        variant="soft"
        icon="i-mdi-eye-refresh-outline"
        @click="showAll"
      >
        {{ t('page.tasks.map.raid_plan.show_all') }}
      </UButton>
      <UPopover :content="{ align: 'end', side: 'bottom', sideOffset: 8 }">
        <UButton
          data-testid="map-raid-plan-choose"
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-mdi-format-list-checks"
          :disabled="tasks.length === 0"
        >
          {{ t('page.tasks.map.raid_plan.choose_quests') }}
        </UButton>
        <template #content>
          <div class="w-80 max-w-full p-2">
            <p class="text-surface-400 px-1.5 pt-1 pb-2 text-xs">
              {{ t('page.tasks.map.raid_plan.popover_description') }}
            </p>
            <ul class="max-h-80 overflow-y-auto">
              <li
                v-for="row in rows"
                :key="row.task.id"
                data-testid="map-raid-plan-row"
                class="group flex h-8 items-center gap-1 rounded-md pr-1 hover:bg-white/5"
              >
                <button
                  type="button"
                  role="checkbox"
                  data-testid="map-raid-plan-row-toggle"
                  :aria-checked="row.isShown"
                  class="focus-visible:ring-primary-500 flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left focus:outline-none focus-visible:ring-2"
                  @click="preferencesStore.toggleMapHiddenTask(row.task.id)"
                >
                  <UIcon
                    :name="row.isShown ? 'i-mdi-checkbox-marked' : 'i-mdi-checkbox-blank-outline'"
                    class="h-4 w-4 shrink-0"
                    :class="row.isShown ? 'text-primary-400' : 'text-surface-500'"
                    aria-hidden="true"
                  />
                  <span
                    class="truncate text-xs"
                    :class="row.isShown ? 'text-surface-100' : 'text-surface-500 line-through'"
                  >
                    {{ row.task.name }}
                  </span>
                </button>
                <UButton
                  data-testid="map-raid-plan-row-only"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="shrink-0 opacity-70 group-hover:opacity-100 focus-visible:opacity-100"
                  :aria-label="
                    t('page.tasks.map.raid_plan.show_only_named', { name: row.task.name })
                  "
                  @click="showOnly(row.task.id)"
                >
                  {{ t('page.tasks.map.raid_plan.only') }}
                </UButton>
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
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { Task } from '@/types/tarkov';
  const props = defineProps<{
    tasks: Task[];
    hiddenTaskIds: ReadonlySet<string>;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const preferencesStore = usePreferencesStore();
  const rows = computed(() =>
    props.tasks.map((task) => ({ task, isShown: !props.hiddenTaskIds.has(task.id) }))
  );
  const taskIds = computed(() => props.tasks.map((task) => task.id));
  const hiddenCount = computed(() => rows.value.filter((row) => !row.isShown).length);
  const allHidden = computed(
    () => rows.value.length > 0 && hiddenCount.value === rows.value.length
  );
  const summaryText = computed(() => {
    const params = { hidden: hiddenCount.value, total: rows.value.length };
    if (hiddenCount.value === 0) return t('page.tasks.map.raid_plan.summary_all', params);
    return t('page.tasks.map.raid_plan.summary_hidden', params);
  });
  const showOnly = (taskId: string) => {
    preferencesStore.showOnlyMapTask(taskId, taskIds.value);
  };
  const showAll = () => {
    preferencesStore.clearMapTaskVisibility(taskIds.value);
  };
</script>
