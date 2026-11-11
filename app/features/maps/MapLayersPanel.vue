<template>
  <div
    :id="id"
    data-testid="map-layers-panel"
    class="bg-surface-850/95 pointer-events-auto flex min-h-0 w-60 flex-col rounded-lg border border-white/8 shadow-lg @max-[30rem]:max-h-[45vh] @max-[30rem]:w-full"
  >
    <div class="min-h-0 overflow-y-auto p-1.5">
      <div
        v-for="group in groups"
        :key="group.key"
        role="group"
        :aria-labelledby="`${id}-${group.key}`"
        class="not-first:mt-1.5 not-first:border-t not-first:border-white/8 not-first:pt-1.5"
      >
        <p
          :id="`${id}-${group.key}`"
          class="text-surface-400 px-2 pt-0.5 pb-1 text-[10px] font-medium tracking-wide uppercase"
        >
          {{ group.label }}
        </p>
        <MapLayerRow
          v-for="item in group.items"
          :key="item.key"
          :item="item"
          @toggle="emit('toggle', $event)"
        />
      </div>
      <div class="mt-1.5 border-t border-white/8 pt-1.5">
        <button
          type="button"
          role="switch"
          :aria-checked="alwaysShowNames"
          data-testid="map-layers-always-names"
          class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 flex min-h-8 w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          @click="alwaysShowNames = !alwaysShowNames"
        >
          <UIcon name="i-mdi-label-outline" class="text-surface-300 h-4.5 w-4.5 shrink-0" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-surface-100 truncate font-medium">
              {{ t('maps.layers.always_show_names') }}
            </span>
            <span class="text-surface-500 text-[10px] leading-tight">
              {{ t('maps.layers.names_hint') }}
            </span>
          </span>
          <span
            class="relative h-4 w-7 shrink-0 rounded-full transition-colors"
            :class="alwaysShowNames ? 'bg-primary-500' : 'bg-surface-600'"
            aria-hidden="true"
          >
            <span
              class="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform"
              :class="alwaysShowNames ? 'translate-x-3' : ''"
            />
          </span>
        </button>
      </div>
      <details
        class="group/objectives mt-1.5 border-t border-white/8 px-2 pt-2 pb-1 text-[10px] leading-snug"
        data-testid="map-objective-icon-legend"
      >
        <summary
          class="text-surface-400 hover:text-surface-200 flex cursor-pointer list-none items-center gap-1 font-semibold uppercase [&::-webkit-details-marker]:hidden"
        >
          <UIcon
            name="i-mdi-chevron-right"
            class="h-3 w-3 shrink-0 transition-transform group-open/objectives:rotate-90"
          />
          {{ t('maps.objective_icons.legend_title') }}
        </summary>
        <ul class="text-surface-300 mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
          <li
            v-for="kind in MAP_OBJECTIVE_GLYPH_LEGEND_KINDS"
            :key="kind"
            class="flex items-center gap-1"
          >
            <span
              class="bg-surface-600 inline-flex size-4 shrink-0 items-center justify-center rounded-full text-white ring-1 ring-white/80"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="size-2.5">
                <path fill="currentColor" :d="MAP_OBJECTIVE_GLYPH_PATHS[kind]" />
              </svg>
            </span>
            <span class="truncate">{{ t(`maps.objective_icons.kinds.${kind}`) }}</span>
          </li>
        </ul>
      </details>
      <details
        class="group/key mt-1.5 border-t border-white/8 px-2 pt-2 pb-1 text-[10px] leading-snug"
      >
        <summary
          class="text-surface-400 hover:text-surface-200 flex cursor-pointer list-none items-center gap-1 font-semibold uppercase [&::-webkit-details-marker]:hidden"
        >
          <UIcon
            name="i-mdi-chevron-right"
            class="h-3 w-3 shrink-0 transition-transform group-open/key:rotate-90"
          />
          {{ t('maps.extract_requirements.legend_title') }}
        </summary>
        <ul class="text-surface-300 mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
          <li v-for="key in MAP_REQUIREMENT_LEGEND_KEYS" :key="key" class="flex items-center gap-1">
            <span
              class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-black/85 text-amber-300 ring-1 ring-white/25"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="size-2.5">
                <path fill="currentColor" :d="MAP_REQUIREMENT_ICON_PATHS[key]" />
              </svg>
            </span>
            <span class="truncate">{{ t(`maps.extract_requirements.tags.${key}`) }}</span>
          </li>
          <li class="col-span-2 flex items-center gap-1">
            <span
              class="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-black/85 text-white ring-1 ring-white/80"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="size-3">
                <path fill="currentColor" :d="MAP_ELEVATION_ARROW_PATHS.up" />
              </svg>
            </span>
            <span>{{ t('maps.elevation.legend') }}</span>
          </li>
        </ul>
      </details>
    </div>
    <button
      v-if="hiddenCount > 0"
      type="button"
      data-testid="map-layers-show-all"
      class="text-primary-300 hover:text-primary-200 light:text-primary-800 focus-visible:ring-primary-500 border-t border-white/8 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
      @click="emit('show-all')"
    >
      {{ t('maps.layers.show_all') }}
    </button>
  </div>
</template>
<script setup lang="ts">
  import MapLayerRow from '@/features/maps/MapLayerRow.vue';
  import {
    MAP_ELEVATION_ARROW_PATHS,
    MAP_REQUIREMENT_ICON_PATHS,
    MAP_REQUIREMENT_LEGEND_KEYS,
  } from '@/features/maps/utils/mapIcons';
  import {
    countHiddenLayers,
    type MapLayerGroup,
    type MapLayerItem,
  } from '@/features/maps/utils/mapLayerGroups';
  import {
    MAP_OBJECTIVE_GLYPH_LEGEND_KINDS,
    MAP_OBJECTIVE_GLYPH_PATHS,
  } from '@/features/maps/utils/objectiveGlyphs';
  /** Combined legend and visibility list; each row shows a marker type and toggles it. */
  const props = defineProps<{ id: string; groups: MapLayerGroup[] }>();
  const emit = defineEmits<{ toggle: [item: MapLayerItem]; 'show-all': [] }>();
  const alwaysShowNames = defineModel<boolean>('alwaysShowNames', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const hiddenCount = computed(() => countHiddenLayers(props.groups));
</script>
