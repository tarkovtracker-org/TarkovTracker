<template>
  <div :class="rootClass" @keydown.esc.stop="emit('close')">
    <div class="flex items-center justify-between gap-2">
      <span class="text-surface-300 text-[10px] font-semibold tracking-wide uppercase">
        {{ t('maps.tooltip.stacked_objectives', { count: entries.length }) }}
      </span>
      <button
        type="button"
        class="text-surface-400 hover:text-surface-100 focus-visible:ring-primary-500 inline-flex size-6 items-center justify-center rounded-md hover:bg-white/10 focus:outline-none focus-visible:ring-2"
        :aria-label="t('common.close')"
        @click.stop="emit('close')"
      >
        <UIcon name="i-mdi-close" class="h-4 w-4" />
      </button>
    </div>
    <ul class="mt-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
      <li v-for="entry in entries" :key="entry.id">
        <button
          ref="entryButtons"
          type="button"
          class="focus-visible:ring-primary-500 flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-white/10 focus:outline-none focus-visible:ring-2"
          @click.stop="emit('select', entry.id)"
        >
          <span class="relative shrink-0">
            <ObjectiveTraderAvatar :alt="entry.traderName" :image="entry.traderImage" />
            <span
              class="bg-surface-500 absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center border text-white"
              :class="MAP_OBJECTIVE_CHIP_SKIN_CLASS"
              role="img"
              :aria-label="t(`maps.objective_icons.kinds.${entry.glyphKind}`)"
            >
              <svg viewBox="0 0 24 24" class="size-2.5" aria-hidden="true">
                <path fill="currentColor" :d="MAP_OBJECTIVE_GLYPH_PATHS[entry.glyphKind]" />
              </svg>
            </span>
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-surface-100 w-full truncate text-xs font-semibold">
              {{ entry.taskName }}
            </span>
            <span
              v-if="!isCompact || hasDuplicateTaskNames"
              class="text-surface-400 line-clamp-2 w-full text-xs leading-snug"
            >
              {{ entry.description }}
            </span>
          </span>
          <UIcon
            name="i-mdi-chevron-right"
            class="text-surface-500 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
        </button>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import ObjectiveTraderAvatar from '@/features/maps/ObjectiveTraderAvatar.vue';
  import {
    MAP_OBJECTIVE_CHIP_SKIN_CLASS,
    MAP_OBJECTIVE_GLYPH_PATHS,
  } from '@/features/maps/utils/objectiveGlyphs';
  import { describeStackEntry } from '@/features/maps/utils/objectivePopup';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import type { Composer } from 'vue-i18n';
  const props = defineProps<{ objectiveIds: string[]; t: Composer['t'] }>();
  const emit = defineEmits<{ close: []; select: [objectiveId: string] }>();
  const metadataStore = useMetadataStore();
  const preferencesStore = usePreferencesStore();
  const isCompact = computed(() => preferencesStore.getMapTooltipDensity === 'compact');
  const rootClass = computed(() => (isCompact.value ? 'w-64 max-w-full' : 'w-80 max-w-full'));
  const entryButtons = ref<HTMLButtonElement[]>([]);
  const entries = computed(() =>
    props.objectiveIds.map((id) => {
      const objective = metadataStore.objectives.find((o) => o.id === id);
      const task = metadataStore.tasks.find((candidate) => candidate.id === objective?.taskId);
      return describeStackEntry(id, objective, task, props.t('common.task'));
    })
  );
  const hasDuplicateTaskNames = computed(
    () => new Set(entries.value.map((entry) => entry.taskName)).size < entries.value.length
  );
  const focusFirstEntry = () => {
    const firstEntry = entryButtons.value[0];
    if (firstEntry?.isConnected) firstEntry.focus();
  };
  defineExpose({ focusFirstEntry });
</script>
