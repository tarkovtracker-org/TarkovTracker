<template>
  <div v-if="needs.length" class="space-y-1.5 pl-6" data-weapon-build-items>
    <div
      v-for="need in needs"
      :key="need.id"
      class="flex w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-1.5 py-1"
    >
      <ObjectiveItemDisplay :primary-item="need.item" :fallback-name="need.item?.name ?? ''" />
      <div class="ml-auto shrink-0">
        <input
          v-if="neededCountOf(need) === 1"
          type="checkbox"
          class="accent-primary-500 focus-visible:ring-primary-500 h-4 w-4 cursor-pointer rounded focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          :aria-label="`${t('needed_items.mark_collected')}: ${need.item?.name}`"
          :checked="progress.storedCountOf(need) >= 1"
          :disabled="props.disabled"
          @change="setCount(need, progress.storedCountOf(need) >= 1 ? 0 : 1)"
        />
        <ObjectiveCountControls
          v-else
          :current-count="progress.storedCountOf(need)"
          :needed-count="neededCountOf(need)"
          :disabled="props.disabled"
          @decrease="setCount(need, progress.storedCountOf(need) - 1)"
          @increase="setCount(need, progress.storedCountOf(need) + 1)"
          @toggle="
            setCount(
              need,
              progress.storedCountOf(need) >= neededCountOf(need) ? 0 : neededCountOf(need)
            )
          "
          @set-count="(count) => setCount(need, count)"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    neededCountOf,
    useNeededItemProgress,
  } from '@/features/neededitems/useNeededItemProgress';
  import ObjectiveCountControls from '@/features/tasks/ObjectiveCountControls.vue';
  import ObjectiveItemDisplay from '@/features/tasks/ObjectiveItemDisplay.vue';
  import { trackTaskProgressInteractionKey } from '@/features/tasks/task-context';
  import { useMetadataStore } from '@/stores/useMetadata';
  import type { NeededItemTaskObjective } from '@/types/tarkov';
  const props = defineProps<{ objectiveId: string; disabled?: boolean }>();
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const progress = useNeededItemProgress();
  const trackProgress = inject(trackTaskProgressInteractionKey, null);
  // Consume the same records as Needed Items, including its existing part progress IDs.
  const needs = computed(() =>
    metadataStore.neededItemTaskObjectives.filter(
      (need) => (need.sourceObjectiveId ?? need.id) === props.objectiveId
    )
  );
  const setCount = (need: NeededItemTaskObjective, count: number) => {
    if (props.disabled) return;
    progress.setCount(need, Math.max(0, Math.min(neededCountOf(need), count)));
    trackProgress?.(need.taskId, 'objective_progress');
  };
</script>
