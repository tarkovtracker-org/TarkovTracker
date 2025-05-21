<template>
  <div
    :style="markerStyle"
    :class="markerColor"
    @mouseenter="showTooltip()"
    @mouseleave="hideTooltip()"
    @click="forceTooltipToggle()"
  >
    <v-icon>{{ tooltipVisible == true ? 'mdi-map-marker-radius' : 'mdi-map-marker' }}</v-icon>
  </div>
  <div v-if="tooltipVisible" :style="tooltipStyle">
    <v-sheet class="ma-0 elevation-3 rounded px-1 pt-2" color="primary">
      <task-link :task="relatedTask" show-wiki-link />
      <task-objective
        v-if="props.mark.id"
        :objective="objectives.find((obj) => obj.id == props.mark.id)"
      />
    </v-sheet>
  </div>
</template>
<script setup>
  import { computed, defineAsyncComponent, ref } from 'vue';
  import { useTarkovData } from '@/composables/tarkovdata';
  const TaskObjective = defineAsyncComponent(() => import('@/components/tasks/TaskObjective'));
  const TaskLink = defineAsyncComponent(() => import('@/components/tasks/TaskLink'));
  const { objectives, tasks } = useTarkovData();
  const props = defineProps({
    mark: {
      type: Object,
      required: true,
    },
    markLocation: {
      type: Object,
      required: true,
    },
    selectedFloor: {
      type: String,
      required: false,
      default: '',
    },
    map: {
      type: Object,
      required: true,
    },
  });
  const forceTooltip = ref(false);
  const hoverTooltip = ref(false);
  const forceTooltipToggle = () => {
    forceTooltip.value = !forceTooltip.value;
  };
  const showTooltip = () => {
    hoverTooltip.value = true;
  };
  const hideTooltip = () => {
    hoverTooltip.value = false;
  };
  const tooltipVisible = computed(() => {
    //if (props.mark.floor !== props.selectedFloor) return false;
    return forceTooltip.value || hoverTooltip.value;
  });
  const relatedObjective = computed(() => {
    return objectives.value.find((obj) => obj.id == props.mark.id);
  });
  const relatedTask = computed(() => {
    return tasks.value.find((task) => task.id == relatedObjective.value?.taskId);
  });
  const markerColor = computed(() => {
    return props.mark.users.includes('self') ? 'text-red' : 'text-orange';
  });
  const relativeLocation = computed(() => {
    // Add safety check for bounds
    const bounds = props.map?.svg?.bounds;
    if (
      !bounds ||
      !Array.isArray(bounds) ||
      bounds.length < 2 ||
      !Array.isArray(bounds[0]) ||
      !Array.isArray(bounds[1])
    ) {
      console.warn('MapMarker: Invalid or missing map bounds for map:', props.map?.name);
      return { leftPercent: 0, topPercent: 0 }; // Return default if bounds are invalid
    }
    // Take the bounds of the map and figure out the initial relative position
    let mapLeft = bounds[0][0];
    let mapTop = bounds[0][1];
    let mapWidth = Math.max(bounds[0][0], bounds[1][0]) - Math.min(bounds[0][0], bounds[1][0]);
    let mapHeight = Math.max(bounds[0][1], bounds[1][1]) - Math.min(bounds[0][1], bounds[1][1]);
    // Prevent division by zero if width or height is 0
    if (mapWidth === 0 || mapHeight === 0) {
      console.warn('MapMarker: Map width or height is zero for map:', props.map?.name);
      return { leftPercent: 0, topPercent: 0 };
    }
    let relativeLeft = Math.abs(props.markLocation.positions[0].x - mapLeft);
    let relativeTop = Math.abs(props.markLocation.positions[0].z - mapTop);
    let relativeLeftPercent = (relativeLeft / mapWidth) * 100;
    let relativeTopPercent = (relativeTop / mapHeight) * 100;
    return {
      leftPercent: relativeLeftPercent,
      topPercent: relativeTopPercent,
    };
  });
  const markerStyle = computed(() => {
    return {
      position: 'absolute',
      top: relativeLocation.value.topPercent + '%',
      left: relativeLocation.value.leftPercent + '%',
      width: '20px',
      height: '20px',
      transform: 'translate(-50%, -50%)',
      // cursor: props.mark.floor === props.selectedFloor ? "pointer" : "inherit",
      // opacity: props.mark.floor === props.selectedFloor ? 1 : 0.2,
      cursor: 'pointer',
      opacity: 1,
    };
  });
  const tooltipStyle = computed(() => {
    return {
      position: 'absolute',
      top: relativeLocation.value.topPercent + '%',
      left: relativeLocation.value.leftPercent + '%',
      transform: 'translate(-50%, -125%)',
    };
  });
</script>
<style lang="scss">
  .objective-gps-tooltip {
    width: 100%;
  }
</style>
