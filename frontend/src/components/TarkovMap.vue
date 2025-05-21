<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <template v-if="props.map?.svg?.floors?.length > 0">
          <template v-for="(floor, floorIndex) in props.map.svg.floors" :key="floorIndex">
            <v-btn
              variant="tonal"
              :color="floor == selectedFloor ? 'green' : ''"
              class="mx-2"
              @click="setFloor(floor)"
              >{{ floor.replace('_', ' ') }}</v-btn
            >
          </template>
        </template>
      </v-col>
      <v-col cols="12">
        <div :id="randomMapId" style="position: relative; width: 100%">
          <template v-for="(mark, markIndex) in props.marks" :key="markIndex">
            <template
              v-for="(markLocation, markLocationIndex) in mark.possibleLocations"
              :key="markLocationIndex"
            >
              <MapMarker
                v-if="markLocation.map.id === props.map.id"
                :key="markLocationIndex"
                :mark="mark"
                :mark-location="markLocation"
                :selected-floor="selectedFloor"
                :map="props.map"
              />
            </template>
            <template
              v-for="(zoneLocation, zoneLocationIndex) in mark.zones"
              :key="zoneLocationIndex"
            >
              <MapZone
                v-if="zoneLocation.map.id === props.map.id"
                :key="zoneLocationIndex"
                :mark="mark"
                :zone-location="zoneLocation"
                :selected-floor="selectedFloor"
                :map="props.map"
              />
            </template>
          </template>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>
<script setup lang="ts">
  import { ref, onMounted, watch, defineAsyncComponent, defineProps, withDefaults } from 'vue';
  import { v4 as uuidv4 } from 'uuid';
  import * as d3 from 'd3';

  interface Props {
    map: Record<string, any>;
    marks?: Record<string, any>[];
  }

  const randomMapId = ref(uuidv4());
  const props = withDefaults(defineProps<Props>(), {
    marks: () => [],
  });
  const MapMarker = defineAsyncComponent(() => import('@/components/MapMarker.vue'));
  const MapZone = defineAsyncComponent(() => import('@/components/MapZone.vue'));
  const selectedFloor = ref<
    string | undefined // Changed from string | null
  >(props.map?.svg?.floors?.[props.map.svg.floors.length - 1] ?? undefined);
  const setFloor = (floor: string) => {
    selectedFloor.value = floor;
    draw();
  };
  watch(
    () => props.map,
    (newMap) => {
      draw();
      // Safely update selectedFloor only if floors exist
      const floors = newMap?.svg?.floors;
      selectedFloor.value = floors?.[floors.length - 1] ?? undefined; // Changed from null
    }
  );
  const draw = async () => {
    // Add check for map svg data before proceeding
    if (!props.map?.svg?.file) {
      console.warn('Map SVG file info missing, skipping draw.');
      // Clear existing SVG if any
      d3.select(document.getElementById(randomMapId.value)).selectAll('svg').remove();
      return;
    }
    const svg = await d3.svg(
      `https://tarkovtracker.github.io/tarkovdata/maps/` + `${props.map.svg.file}`
    );
    const mapContainer = document.getElementById(randomMapId.value);
    if (mapContainer) {
      d3.select(mapContainer).selectAll('svg').remove();
      mapContainer.appendChild(svg.documentElement);
      d3.select(mapContainer).select('svg').style('width', '100%');
      d3.select(mapContainer).select('svg').style('height', '100%');
    }
    // Calculate the index of the selected floor - Add safety check
    const floors = props.map?.svg?.floors;
    if (selectedFloor.value && floors && floors.length > 0) {
      const selectedFloorIndex = floors.indexOf(selectedFloor.value);
      if (selectedFloorIndex !== -1) {
        // Ensure floor exists in the array
        floors.forEach((floor: string, index: number) => {
          if (index > selectedFloorIndex) {
            d3.select(document.getElementById(randomMapId.value))
              .select('svg')
              .select(`#${floor}`)
              .style('opacity', 0.02);
          }
        }, this);
      }
    }
  };
  onMounted(() => {
    draw();
  });
</script>
<style lang="scss" scoped></style>
