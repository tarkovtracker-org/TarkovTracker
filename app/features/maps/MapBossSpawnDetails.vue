<template>
  <div data-testid="map-boss-spawn-details">
    <div class="text-surface-400 mb-1.5 font-medium">{{ t('maps.boss_spawns.raid_chance') }}</div>
    <ul class="space-y-1.5">
      <li v-for="(row, index) in rows" :key="index">
        <component :is="row.containerTag" class="group/boss">
          <component
            :is="row.headingTag"
            class="flex list-none items-start gap-1.5 [&::-webkit-details-marker]:hidden"
            :class="{ 'cursor-pointer rounded hover:bg-white/5': row.canExpand }"
          >
            <UIcon
              v-if="row.canExpand"
              name="i-mdi-chevron-right"
              class="text-surface-400 mt-px size-3 shrink-0 transition-transform group-open/boss:rotate-90"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 break-words" :class="{ 'pl-4.5': row.indentName }">
              <span class="text-surface-100 font-medium">{{ row.name }}</span>
              <span v-if="row.mapName" class="text-surface-400 block">{{ row.mapName }}</span>
            </span>
            <span class="text-surface-100 shrink-0 font-semibold tabular-nums">
              {{ row.chance }}
            </span>
          </component>
          <ul class="text-surface-300 mt-0.5 space-y-0.5" :class="{ 'pl-4.5': expandable }">
            <li v-for="(area, areaIndex) in row.areas" :key="areaIndex" class="break-words">
              {{ area.label }}
              <span v-if="area.noPin" class="text-surface-400">
                · {{ t('maps.boss_spawns.no_pin') }}
              </span>
            </li>
          </ul>
        </component>
      </li>
    </ul>
  </div>
</template>
<script setup lang="ts">
  import type { MapBossSpawn, MapBossSpawnLocation } from '@/types/tarkov';
  const props = defineProps<{ bosses: MapBossSpawn[]; expandable?: boolean }>();
  const { t, locale } = useI18n({ useScope: 'global' });
  const formatter = computed(
    () => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 2 })
  );
  const percent = (chance: number) => formatter.value.format(chance);
  const areaLabel = ({ name, chance }: MapBossSpawnLocation) =>
    chance === undefined
      ? name
      : t('maps.boss_spawns.area_chance', { name, chance: percent(chance) });
  const areasFor = (locations: MapBossSpawnLocation[]) =>
    locations.length
      ? locations.map((area) => ({ label: areaLabel(area), noPin: area.positions.length === 0 }))
      : [{ label: t('maps.boss_spawns.no_location'), noPin: false }];
  const rows = computed(() =>
    props.bosses.map(({ name, chance, mapName, locations }) => {
      const canExpand = Boolean(props.expandable && locations.length);
      const tags = canExpand
        ? { containerTag: 'details', headingTag: 'summary' }
        : { containerTag: 'div', headingTag: 'div' };
      return {
        name,
        mapName,
        chance: percent(chance),
        areas: areasFor(locations),
        canExpand,
        indentName: props.expandable && !canExpand,
        ...tags,
      };
    })
  );
</script>
