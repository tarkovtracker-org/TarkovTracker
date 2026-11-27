<template>
  <AppTooltip :text="t('maps.tooltips.switch_floor')" :content="{ side: 'right' }">
    <div
      class="bg-surface-850/95 pointer-events-auto flex shrink-0 flex-col gap-1 rounded-lg border border-white/8 p-1.5 shadow-lg @max-[30rem]:w-full"
      :class="{ '@max-[30rem]:flex-row @max-[30rem]:items-center': !activeGroup }"
    >
      <span class="text-surface-400 px-1 text-[10px] font-medium tracking-wide uppercase">
        {{ t('maps.floors') }}
      </span>
      <div
        v-if="activeGroup"
        class="bg-surface-900 grid grid-cols-2 gap-1 rounded-md p-0.5"
        role="group"
        :aria-label="t('maps.floor_groups.label')"
      >
        <button
          v-for="group in groups"
          :key="group.labelKey"
          type="button"
          :aria-pressed="group === activeGroup"
          class="focus-visible:ring-primary-500 text-surface-300/65 aria-pressed:bg-primary-500/15 aria-pressed:text-surface-50 aria-[pressed=false]:hover:text-surface-100 rounded-md px-2 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 aria-[pressed=false]:hover:bg-white/5"
          @click="selectGroup(group)"
        >
          {{ t(group.labelKey) }}
        </button>
      </div>
      <select
        v-if="activeGroup || floors.length > 6"
        :value="selectedFloor"
        :aria-label="t('maps.floors')"
        class="bg-surface-900 text-surface-200 focus-visible:ring-primary-500 min-w-0 rounded-md px-2 py-1.5 text-xs focus:outline-none focus-visible:ring-2"
        @change="emit('select', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="floor in visibleFloors" :key="floor" :value="floor">
          {{ floor.replace(/_/g, ' ') }}
        </option>
      </select>
      <div
        v-else
        class="flex flex-col-reverse gap-0.5 @max-[30rem]:min-w-0 @max-[30rem]:flex-row @max-[30rem]:flex-wrap"
      >
        <button
          v-for="floor in floors"
          :key="floor"
          type="button"
          :aria-pressed="floor === selectedFloor"
          class="focus-visible:ring-primary-500 focus-visible:ring-offset-surface-850 relative flex h-8 w-full items-center rounded-md px-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 @max-[30rem]:w-auto"
          :class="
            floor === selectedFloor
              ? 'bg-primary-500/15 text-surface-50'
              : 'text-surface-300/65 hover:text-surface-100 hover:bg-white/5'
          "
          @click="emit('select', floor)"
        >
          <span
            v-if="floor === selectedFloor"
            class="bg-primary-400 absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full"
          />
          {{ floor.replace(/_/g, ' ') }}
        </button>
      </div>
    </div>
  </AppTooltip>
</template>
<script setup lang="ts">
  import type { MapFloorGroup } from '@/types/tarkov';
  const props = defineProps<{
    floors: string[];
    selectedFloor: string;
    groups?: MapFloorGroup[];
  }>();
  const emit = defineEmits<{ select: [floor: string] }>();
  const { t } = useI18n();
  const activeGroup = computed(() =>
    props.groups?.find((group) => group.floors.includes(props.selectedFloor))
  );
  const visibleFloors = computed(() => activeGroup.value?.floors ?? props.floors);
  function selectGroup(group: MapFloorGroup) {
    if (group !== activeGroup.value) emit('select', group.defaultFloor);
  }
</script>
