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
    countHiddenLayers,
    type MapLayerGroup,
    type MapLayerItem,
  } from '@/features/maps/utils/mapLayerGroups';
  /** Combined legend and visibility list; each row shows a marker type and toggles it. */
  const props = defineProps<{ id: string; groups: MapLayerGroup[] }>();
  const emit = defineEmits<{ toggle: [item: MapLayerItem]; 'show-all': [] }>();
  const alwaysShowNames = defineModel<boolean>('alwaysShowNames', { required: true });
  const { t } = useI18n({ useScope: 'global' });
  const hiddenCount = computed(() => countHiddenLayers(props.groups));
</script>
