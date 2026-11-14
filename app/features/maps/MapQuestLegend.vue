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
        class="focus-visible:ring-primary-500 flex h-6 max-w-48 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors focus:outline-hidden focus-visible:ring-2"
        :class="entryClass(entry.task.id)"
        @mouseenter="setPointer(entry.task.id)"
        @mouseleave="setPointer(null)"
        @focus="setFocus(entry.task.id)"
        @blur="setFocus(null)"
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
  const props = defineProps<{
    entries: Array<{ task: Pick<Task, 'id' | 'name'>; color: string }>;
    highlightedTaskId: string | null;
    lockedTaskId: string | null;
  }>();
  const emit = defineEmits<{
    highlight: [taskId: string | null];
    'toggle-highlight-lock': [taskId: string];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  // Pointer and keyboard focus are tracked apart, so moving the mouse off one entry does not drop
  // the highlight of the entry that still has focus.
  const pointerTaskId = ref<string | null>(null);
  const focusTaskId = ref<string | null>(null);
  const report = () => emit('highlight', pointerTaskId.value ?? focusTaskId.value);
  const setPointer = (taskId: string | null) => {
    pointerTaskId.value = taskId;
    report();
  };
  const setFocus = (taskId: string | null) => {
    focusTaskId.value = taskId;
    report();
  };
  // An entry that leaves the legend (its quest was hidden or filtered out) never fires
  // mouseleave or blur, so forget it; otherwise it would light up again when the quest returns.
  const forgetIfGone = (tracked: Ref<string | null>, present: ReadonlySet<string>): boolean => {
    if (tracked.value === null || present.has(tracked.value)) return false;
    tracked.value = null;
    return true;
  };
  watch(
    () => props.entries.map((entry) => entry.task.id),
    (taskIds) => {
      const present = new Set(taskIds);
      const pointerGone = forgetIfGone(pointerTaskId, present);
      const focusGone = forgetIfGone(focusTaskId, present);
      if (pointerGone || focusGone) report();
    }
  );
  // An unmounted legend (closing the fullscreen map) never fires mouseleave or blur.
  onBeforeUnmount(() => {
    if (pointerTaskId.value === null && focusTaskId.value === null) return;
    pointerTaskId.value = null;
    focusTaskId.value = null;
    report();
  });
  /** The highlighted entry lights up; the locked one keeps a primary border while another is hovered. */
  const borderClass = (taskId: string): string => {
    if (props.lockedTaskId === taskId) return 'border-primary-400';
    return props.highlightedTaskId === taskId ? 'border-white/60' : 'border-white/10';
  };
  const entryClass = (taskId: string) => [
    props.highlightedTaskId === taskId
      ? 'text-surface-50 bg-white/10'
      : 'text-surface-300 hover:bg-white/5',
    borderClass(taskId),
  ];
</script>
