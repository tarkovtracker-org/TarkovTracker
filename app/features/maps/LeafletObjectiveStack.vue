<template>
  <div :class="rootClass" @keydown.esc.stop="emit('close')">
    <div class="flex items-center justify-between gap-2">
      <span class="text-surface-300 text-xs font-semibold">
        {{ t('maps.tooltip.stacked_objectives', { count: entries.length }) }}
      </span>
      <button
        type="button"
        class="inline-flex h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-white/10"
        :aria-label="t('common.close')"
        @click.stop="emit('close')"
      >
        <UIcon name="i-mdi-close" class="h-3 w-3" />
      </button>
    </div>
    <ul class="mt-1 flex max-h-60 flex-col gap-0.5 overflow-y-auto">
      <li v-for="entry in entries" :key="entry.id">
        <button
          ref="entryButtons"
          type="button"
          class="focus-visible:ring-primary-500 flex w-full flex-col items-start rounded px-1.5 py-1 text-left hover:bg-white/10 focus:outline-none focus-visible:ring-2"
          @click.stop="emit('select', entry.id)"
        >
          <span class="text-surface-100 w-full truncate text-xs font-semibold">
            {{ entry.taskName }}
          </span>
          <span v-if="!isCompact" class="text-surface-400 w-full truncate text-xs">
            {{ entry.description }}
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { Composer } from 'vue-i18n';
  const props = defineProps<{ objectiveIds: string[]; t: Composer['t']; autofocus?: boolean }>();
  const emit = defineEmits<{ close: []; select: [objectiveId: string] }>();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const isCompact = computed(() => preferencesStore.getMapTooltipDensity === 'compact');
  const rootClass = computed(() => ['max-w-72', isCompact.value ? 'min-w-40' : 'min-w-55']);
  const entryButtons = ref<HTMLButtonElement[]>([]);
  const entries = computed(() =>
    props.objectiveIds.map((id) => {
      const objective = metadataStore.objectives.find((o) => o.id === id);
      const task = metadataStore.tasks.find((candidate) => candidate.id === objective?.taskId);
      return {
        id,
        taskName: task?.name ?? props.t('common.task'),
        description: objective?.description ?? '',
      };
    })
  );
  onMounted(() => {
    if (props.autofocus) entryButtons.value[0]?.focus();
  });
</script>
