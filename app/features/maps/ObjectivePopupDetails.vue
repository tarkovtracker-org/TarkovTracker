<template>
  <div
    data-testid="objective-details"
    class="rounded-md border border-white/8 bg-black/25"
    :class="compact ? 'p-1.5' : 'p-2'"
  >
    <div class="flex items-center justify-between gap-2">
      <span
        class="text-surface-300 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase"
      >
        <span
          class="bg-surface-500 inline-flex size-5 shrink-0 items-center justify-center border text-white"
          :class="MAP_OBJECTIVE_CHIP_SKIN_CLASS"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" class="size-3">
            <path fill="currentColor" :d="MAP_OBJECTIVE_GLYPH_PATHS[glyphKind]" />
          </svg>
        </span>
        <span data-testid="objective-action" class="truncate">
          {{ translate(`maps.objective_icons.kinds.${glyphKind}`) }}
        </span>
      </span>
      <span
        v-if="complete"
        data-testid="objective-complete-badge"
        class="bg-success-900/40 text-success-300 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      >
        <UIcon name="i-mdi-check" class="h-3 w-3" />
        {{ translate('common.completed') }}
      </span>
    </div>
    <p class="text-surface-100 mt-1.5 leading-snug" :class="descriptionClass">
      {{ description }}
    </p>
    <div
      v-if="item"
      data-testid="objective-item"
      class="mt-2 flex items-center gap-2 rounded bg-white/5 p-1"
    >
      <img
        v-if="item.icon"
        :src="item.icon"
        alt=""
        aria-hidden="true"
        width="32"
        height="32"
        loading="lazy"
        decoding="async"
        class="size-8 shrink-0 rounded bg-black/40 object-contain"
      />
      <span class="text-surface-200 min-w-0 flex-1 truncate text-xs" :title="item.label">
        {{ item.label }}
      </span>
      <span
        v-if="foundInRaid"
        class="shrink-0 rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-bold text-amber-300"
        :title="translate('common.found_in_raid_required')"
      >
        {{ translate('common.fir') }}
      </span>
    </div>
    <div
      v-for="key in keyLabels"
      :key="key"
      data-testid="objective-key"
      class="mt-1.5 flex items-start gap-1.5 text-xs text-amber-200"
    >
      <UIcon name="i-mdi-key-variant" class="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0">{{ translate('maps.tooltip.key', { key }) }}</span>
    </div>
    <div v-if="progress" data-testid="objective-progress" class="mt-2">
      <div class="text-surface-400 flex justify-between text-[10px] tabular-nums">
        <span>{{ translate('maps.tooltip.progress') }}</span>
        <span>{{ progress.current }}/{{ progress.required }}</span>
      </div>
      <div
        class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        :aria-valuenow="progress.current"
        aria-valuemin="0"
        :aria-valuemax="progress.required"
        :aria-label="translate('maps.tooltip.progress')"
      >
        <div
          class="bg-success-500 h-full rounded-full transition-all"
          :style="{ width: `${progress.percent}%` }"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    MAP_OBJECTIVE_CHIP_SKIN_CLASS,
    MAP_OBJECTIVE_GLYPH_PATHS,
    type MapObjectiveGlyphKind,
  } from '@/features/maps/utils/objectiveGlyphs';
  import type { ObjectivePopupProgress } from '@/features/maps/utils/objectivePopup';
  /** What the objective asks for at this location: action, item, keys and progress. */
  const props = defineProps<{
    glyphKind: MapObjectiveGlyphKind;
    description: string;
    complete: boolean;
    foundInRaid: boolean;
    item: { label: string; icon: string } | null;
    keyLabels: string[];
    progress: ObjectivePopupProgress | null;
    compact: boolean;
    translate: (key: string, params?: Record<string, unknown>) => string;
  }>();
  const descriptionClass = computed(() => [
    props.compact ? 'text-xs' : 'text-sm',
    props.complete ? 'opacity-70' : '',
  ]);
</script>
