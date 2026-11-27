<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="space-y-1">
        <h3 class="text-surface-100 text-sm font-semibold">{{ $t('setup.hideout_title') }}</h3>
        <p class="text-surface-400 text-xs">{{ $t('setup.hideout_help') }}</p>
      </div>
      <UInput
        v-model="stationFilter"
        icon="i-mdi-magnify"
        type="search"
        size="sm"
        class="w-full sm:w-56"
        :placeholder="$t('setup.hideout_search_placeholder')"
      />
    </div>
    <UAlert
      v-if="blockedRows.length"
      color="warning"
      variant="soft"
      icon="i-mdi-alert-outline"
      :title="$t('setup.hideout_blocked_title')"
    >
      <template #description>
        <p class="text-xs">{{ $t('setup.hideout_blocked_help') }}</p>
        <ul class="mt-2 space-y-1.5 text-xs">
          <li v-for="row in blockedRows" :key="row.id">
            <span class="font-semibold">{{ row.title }}</span>
            <span class="text-surface-300">{{ row.detailSuffix }}</span>
          </li>
        </ul>
        <div v-if="blockedActions.length" class="mt-3 flex flex-wrap items-center gap-2">
          <UButton
            v-for="action in blockedActions"
            :key="action.id"
            size="xs"
            :color="action.color"
            :variant="action.variant"
            :icon="action.icon"
            :disabled="saving"
            @click="action.onClick"
          >
            {{ action.label }}
          </UButton>
        </div>
      </template>
    </UAlert>
    <div class="grid gap-2.5 sm:grid-cols-2">
      <div
        v-for="row in stationRows"
        :key="row.id"
        class="flex items-center gap-3 rounded-lg border p-3 transition-colors"
        :class="row.cardClass"
      >
        <img
          v-if="row.imageLink"
          :src="row.imageLink"
          :alt="row.name"
          class="bg-surface-900 size-9 shrink-0 rounded-md object-contain p-1"
          loading="lazy"
        />
        <span
          v-else
          class="bg-surface-800 flex size-9 shrink-0 items-center justify-center rounded-md"
        >
          <UIcon name="i-mdi-home-outline" class="text-surface-400 size-4" />
        </span>
        <div class="min-w-0 flex-1 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <label :for="row.inputId" class="text-surface-100 truncate text-sm font-medium">
              {{ row.name }}
            </label>
            <span v-if="row.currentLabel" class="text-surface-400 shrink-0 text-xs">
              {{ row.currentLabel }}
            </span>
          </div>
          <USelect
            :id="row.inputId"
            class="w-full"
            size="xs"
            :model-value="row.selectedLevel"
            :items="row.options"
            :disabled="row.disabled"
            @update:model-value="emit('selectLevel', { id: row.id, level: $event })"
          />
        </div>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  import type { BlockedHideoutTierDetail } from '@/stores/tarkov/hideoutPrereqs';
  type Station = {
    id: string;
    name: string;
    imageLink?: string;
    current: number;
    options: { label: string; value: number }[];
    disabled: boolean;
  };
  const props = defineProps<{
    stations: readonly Station[];
    levels: ReadonlyMap<string, number>;
    blockedDetails: readonly BlockedHideoutTierDetail[];
    saving: boolean;
  }>();
  const emit = defineEmits<{
    selectLevel: [selection: { id: string; level: number }];
    includeStationPrereqs: [];
    openTradersTab: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const stationFilter = ref('');
  const hasMissingStations = computed(() =>
    props.blockedDetails.some((detail) => detail.missingStations.length > 0)
  );
  const hasMissingTraders = computed(() =>
    props.blockedDetails.some((detail) => detail.missingTraders.length > 0)
  );
  const blockedActions = computed(() => [
    ...(hasMissingStations.value
      ? [
          {
            id: 'stations',
            color: 'warning' as const,
            variant: 'solid' as const,
            icon: 'i-mdi-auto-fix',
            label: t('setup.hideout_include_prereqs'),
            onClick: () => emit('includeStationPrereqs'),
          },
        ]
      : []),
    ...(hasMissingTraders.value
      ? [
          {
            id: 'traders',
            color: 'neutral' as const,
            variant: 'soft' as const,
            icon: 'i-mdi-account-group',
            label: t('setup.hideout_open_traders'),
            onClick: () => emit('openTradersTab'),
          },
        ]
      : []),
  ]);
  function formatRequirements(detail: BlockedHideoutTierDetail): string {
    return [
      ...detail.missingStations.map((req) =>
        t('setup.hideout_req_station', { station: req.stationName, level: req.requiredLevel })
      ),
      ...detail.missingTraders.map((req) =>
        t('setup.hideout_req_trader', { trader: req.traderName, level: req.requiredLevel })
      ),
      ...detail.missingSkills.map((req) =>
        t('setup.hideout_req_skill', { skill: req.skillName, level: req.requiredLevel })
      ),
    ].join(' · ');
  }
  const blockedRows = computed(() =>
    props.blockedDetails.map((detail) => {
      const requirements = formatRequirements(detail);
      return {
        id: detail.moduleId,
        title: t('setup.hideout_blocked_tier', {
          station: detail.stationName,
          level: detail.level,
        }),
        detailSuffix: requirements ? ` — ${requirements}` : '',
      };
    })
  );
  const stationRows = computed(() => {
    const term = stationFilter.value.trim().toLocaleLowerCase();
    const visible = term
      ? props.stations.filter((station) => station.name.toLocaleLowerCase().includes(term))
      : props.stations;
    return visible.map((station) => {
      const selectedLevel = props.levels.get(station.id) ?? station.current;
      const modified = selectedLevel > station.current;
      return {
        ...station,
        inputId: `setup-station-${station.id}`,
        selectedLevel,
        currentLabel:
          station.current > 0 ? t('setup.station_current', { level: station.current }) : '',
        cardClass: modified
          ? 'border-primary-500/45 bg-primary-500/8'
          : 'border-white/8 bg-surface-950/50',
      };
    });
  });
</script>
