<template>
  <ul
    v-if="entries.length > 0"
    data-testid="map-quest-legend"
    class="flex w-full flex-wrap gap-1.5"
    :aria-label="t('page.tasks.map.raid_plan.legend_label')"
  >
    <li v-for="entry in entries" :key="entry.task.id">
      <button
        type="button"
        data-testid="map-quest-legend-item"
        :aria-pressed="lockedTaskId === entry.task.id"
        :aria-label="
          t('page.tasks.map.raid_plan.legend_highlight_named', { name: entry.task.name })
        "
        class="focus-visible:ring-primary-500 flex h-6 max-w-48 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors focus:outline-none focus-visible:ring-2"
        :class="
          highlightedTaskId === entry.task.id
            ? 'text-surface-50 border-white/60 bg-white/10'
            : 'text-surface-300 border-white/10 hover:bg-white/5'
        "
        @mouseenter="emit('highlight', entry.task.id)"
        @mouseleave="emit('highlight', null)"
        @focus="emit('highlight', entry.task.id)"
        @blur="emit('highlight', null)"
        @click="emit('toggle-highlight-lock', entry.task.id)"
      >
        <span
          class="size-3 shrink-0 rounded-full border border-black/40"
          :style="{ backgroundColor: entry.color }"
          aria-hidden="true"
        />
        <span class="truncate">{{ entry.task.name }}</span>
      </button>
    </li>
  </ul>
</template>
<script setup lang="ts">
  import type { Task } from '@/types/tarkov';
  /**
   * Quest color key above the Tasks map (#920). Hovering or focusing an entry highlights that
   * quest's markers; clicking keeps the highlight until it is clicked again.
   */
  defineProps<{
    entries: Array<{ task: Pick<Task, 'id' | 'name'>; color: string }>;
    highlightedTaskId: string | null;
    lockedTaskId: string | null;
  }>();
  const emit = defineEmits<{
    highlight: [taskId: string | null];
    'toggle-highlight-lock': [taskId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
