<template>
  <div>
    <UAlert
      v-if="!stationProgress.length"
      icon="i-mdi-home-off-outline"
      color="neutral"
      variant="soft"
      :title="t('page.profile.no_hideout')"
    />
    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="station in stationProgress"
        :key="station.id"
        class="bg-surface-900 rounded-lg border border-white/10 p-3"
      >
        <div class="mb-2 flex items-center gap-2">
          <img
            v-if="station.imageLink"
            :src="station.imageLink"
            :alt="station.name"
            class="h-8 w-8 rounded-md"
          />
          <div v-else class="bg-surface-800 flex h-8 w-8 items-center justify-center rounded-md">
            <UIcon name="i-mdi-home-city-outline" class="text-surface-400 h-5 w-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-surface-100 truncate text-sm font-semibold">
              {{ station.name }}
            </div>
            <div class="text-surface-400 text-xs">
              {{ t('page.profile.hideout_level') }} {{ station.completed }}/{{ station.total }}
            </div>
          </div>
          <UIcon
            v-if="station.completed >= station.total && station.total > 0"
            name="i-mdi-check-circle"
            class="text-success-400 h-5 w-5 shrink-0"
          />
        </div>
        <div class="bg-surface-800/60 h-1.5 overflow-hidden rounded-full">
          <div
            class="h-full rounded-full transition-[width] duration-300"
            :class="
              station.completed >= station.total && station.total > 0
                ? 'bg-success-500/70'
                : 'bg-warning-500/70'
            "
            :style="{ width: `${station.percentage.toFixed(2)}%` }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import { calculatePercentageNum } from '@/utils/formatters';
  interface Props {
    hideoutModuleCompletionState: Record<string, boolean>;
  }
  const props = defineProps<Props>();
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  interface StationProgress {
    id: string;
    name: string;
    imageLink: string | undefined;
    completed: number;
    total: number;
    percentage: number;
  }
  const stationProgress = computed<StationProgress[]>(() => {
    const stations = metadataStore.hideoutStations ?? [];
    return stations.map((station) => {
      const levels = station.levels ?? [];
      const total = levels.length;
      let completed = 0;
      for (const level of levels) {
        if (level?.id && props.hideoutModuleCompletionState[level.id] === true) {
          completed++;
        }
      }
      return {
        id: station.id,
        name: station.name || t('page.profile.hideout_fallback'),
        imageLink: station.imageLink,
        completed,
        total,
        percentage: calculatePercentageNum(completed, total),
      };
    });
  });
</script>
