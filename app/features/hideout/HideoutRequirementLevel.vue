<template>
  <section :id="level.anchor" class="scroll-mt-16 pb-4 pl-3">
    <h3 class="text-surface-200 font-medium">
      <a :href="`#${level.anchor}`" class="decoration-surface-600 underline underline-offset-2">
        {{
          t('page.hideout.stationcard.requirements.station', {
            stationname: stationName,
            level: level.level,
          })
        }}
      </a>
    </h3>
    <ul v-if="rows.length" class="text-surface-300 mt-1 ml-5 list-disc space-y-1 wrap-break-word">
      <li v-for="row in rows" :key="row.id">
        <a v-if="row.href" :href="row.href" class="text-primary-400 underline underline-offset-2">
          {{ row.label }}
        </a>
        <template v-else>{{ row.label }}</template>
      </li>
    </ul>
    <p v-else class="text-surface-400 mt-1">{{ t('page.hideout.no_listed_requirements') }}</p>
  </section>
</template>
<script setup lang="ts">
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { loadHideoutRequirements } from '@/server/utils/loadHideoutRequirements';
  type Level = Awaited<ReturnType<typeof loadHideoutRequirements>>[number]['levels'][number];
  const props = defineProps<{ level: Level; stationName: string }>();
  const { t } = useI18n({ useScope: 'global' });
  const formatNumber = useLocaleNumberFormatter();
  interface Row {
    id: string;
    label: string;
    href?: string;
  }
  const rows = computed<Row[]>(() => [
    ...props.level.items.map((item) => ({
      id: item.id,
      label:
        formatNumber(item.count) +
        ' × ' +
        item.name +
        (item.fir ? ' · ' + t('common.found_in_raid_required') : ''),
    })),
    ...props.level.stations.map((station) => ({
      id: station.id,
      label: t('page.hideout.stationcard.requirements.station', {
        stationname: station.name,
        level: station.level,
      }),
      href: station.anchor && '#' + station.anchor,
    })),
    ...props.level.skills.map((skill) => ({
      id: skill.id,
      label: t('page.hideout.stationcard.requirements.skill', {
        skillname: skill.name,
        level: skill.level,
      }),
    })),
    ...props.level.traders.map((trader) => ({
      id: trader.id,
      label:
        trader.name +
        ' · ' +
        t(
          trader.type === 'reputation'
            ? 'page.dashboard.traders.reputation'
            : 'page.dashboard.traders.loyalty_level'
        ) +
        ' ' +
        trader.comparison +
        ' ' +
        trader.value,
    })),
  ]);
</script>
