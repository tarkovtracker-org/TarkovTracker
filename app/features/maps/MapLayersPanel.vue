<template>
  <div
    :id="id"
    data-testid="map-layers-panel"
    class="bg-surface-850/95 pointer-events-auto flex min-h-0 w-60 flex-col rounded-lg border border-white/8 shadow-lg @max-[30rem]:w-full"
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
  const { t } = useI18n({ useScope: 'global' });
  const hiddenCount = computed(() => countHiddenLayers(props.groups));
</script>
