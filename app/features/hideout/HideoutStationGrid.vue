<template>
  <div
    data-help-target="hideout-station-grid"
    class="mt-2 grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3"
  >
    <div
      v-for="(hStation, hIndex) in visibleStationsSlice"
      :key="hStation.id"
      class="content-visibility-auto-240 h-full"
      :data-help-target="hIndex === 0 ? 'hideout-first-station-card' : undefined"
    >
      <HideoutCard
        :station="hStation"
        :highlighted="highlightedStationId === hStation.id"
        :highlight-module-id="
          highlightedStationId === hStation.id ? highlightedModuleId : undefined
        "
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import HideoutCard from './HideoutCard.vue';
  import type { HideoutStation } from '@/types/tarkov';
  defineProps<{
    visibleStationsSlice: HideoutStation[];
    highlightedStationId?: string | null;
    highlightedModuleId?: string | null;
  }>();
</script>
