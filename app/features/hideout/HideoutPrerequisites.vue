<template>
  <div
    v-if="rows.length"
    class="border-surface-700 space-y-1.5 border-t pt-2.5 sm:space-y-2 sm:pt-3"
  >
    <div
      class="text-surface-400 mb-1.5 text-[11px] font-medium tracking-wider uppercase sm:mb-2 sm:text-xs"
    >
      {{ t('page.hideout.stationcard.prerequisites') }}
    </div>
    <div v-for="row in rows" :key="row.id" class="text-xs sm:text-sm">
      <NuxtLink
        :to="row.link"
        class="focus-visible:ring-primary-400/60 flex items-center gap-1.5 rounded-md transition hover:underline focus-visible:ring-2 focus-visible:outline-none sm:gap-2"
        :class="row.met ? 'text-success-400' : 'text-error-400 font-semibold'"
      >
        <UIcon
          :name="row.icon"
          class="h-3.5 w-3.5 sm:h-4 sm:w-4"
          :class="row.met ? row.tone : 'text-error-500 light:text-error-800'"
        />
        {{ row.label }}
        <UIcon name="i-mdi-arrow-top-right" class="h-3 w-3 shrink-0 opacity-75 sm:h-3.5 sm:w-3.5" />
      </NuxtLink>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useHideoutStationStatus } from '@/composables/useHideoutStationStatus';
  import { useMetadataStore } from '@/stores/useMetadata';
  import type {
    HideoutLevel,
    StationLevelRequirement,
    SkillRequirement,
    TraderRequirement,
  } from '@/types/tarkov';
  const props = defineProps<{ level: HideoutLevel }>();
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const { isStationReqMet, isSkillReqMet, isTraderReqMet } = useHideoutStationStatus();
  const getStationRequirementLink = (requirement: StationLevelRequirement) => {
    const moduleId = metadataStore
      .getStationById(requirement.station.id)
      ?.levels.find((level) => level.level === requirement.level)?.id;
    return {
      path: '/hideout',
      query: {
        station: requirement.station.id,
        ...(moduleId ? { module: moduleId } : {}),
      },
    };
  };
  const getSkillRequirementLink = (requirement: SkillRequirement) => ({
    path: '/settings',
    hash: '#skills',
    query: {
      skill: requirement.skill?.id || requirement.name,
    },
  });
  const getTraderRequirementLink = (requirement: TraderRequirement) => ({
    path: '/',
    hash: '#dashboard-traders',
    query: {
      trader: requirement.trader.id,
    },
  });
  const rows = computed(() => [
    ...props.level.stationLevelRequirements.map((req) => ({
      id: 'station-' + req.id,
      icon: 'i-mdi-home',
      tone: 'text-info-500 light:text-info-800',
      link: getStationRequirementLink(req),
      met: isStationReqMet(req),
      label: t('page.hideout.stationcard.requirements.station', {
        level: req.level,
        stationname: req.station.name,
      }),
    })),
    ...props.level.skillRequirements.map((req) => ({
      id: 'skill-' + req.id,
      icon: 'i-mdi-star',
      tone: 'text-warning-500 light:text-warning-800',
      link: getSkillRequirementLink(req),
      met: isSkillReqMet(req),
      label: t('page.hideout.stationcard.requirements.skill', {
        level: req.level,
        skillname: req.name,
      }),
    })),
    ...props.level.traderRequirements.map((req) => ({
      id: 'trader-' + req.id,
      icon: 'i-mdi-account-tie',
      tone: 'text-secondary-500 light:text-secondary-800',
      link: getTraderRequirementLink(req),
      met: isTraderReqMet(req),
      label: t('page.hideout.stationcard.requirements.trader', {
        loyaltylevel: req.value,
        tradername: req.trader.name,
      }),
    })),
  ]);
</script>
