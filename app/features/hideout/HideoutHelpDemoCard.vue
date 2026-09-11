<template>
  <div
    data-help-target="hideout-help-demo"
    class="border-surface-700/70 bg-surface-900 space-y-3 rounded-[28px] border p-3 shadow-xl sm:space-y-4 sm:p-4"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-1">
        <div class="text-surface-400 text-[11px] font-semibold tracking-[0.18em] uppercase">
          {{ demoLabel }}
        </div>
        <div class="text-surface-50 text-lg font-semibold">
          {{ demoTitle }}
        </div>
        <p class="text-surface-300 text-sm leading-6">
          {{ demoSummary }}
        </p>
      </div>
      <UBadge color="warning" variant="soft" size="sm">
        {{ safeLabel }}
      </UBadge>
    </div>
    <GenericCard
      :highlight-color="highlightColor"
      :fill-height="false"
      :show-divider="false"
      class="rounded-lg"
      header-classes="pb-1.5 sm:pb-2"
    >
      <template #header>
        <div
          class="flex items-start justify-between gap-2.5 pb-1.5 text-base sm:items-center sm:gap-3 sm:pb-2 sm:text-lg"
        >
          <div class="flex min-w-0 items-start gap-2.5 sm:items-center sm:gap-3">
            <span
              :class="highlightClasses"
              class="inline-flex shrink-0 items-center justify-center rounded-br-lg px-2.5 py-1 shadow-lg sm:px-3"
            >
              <img
                v-if="stationAvatar"
                :src="stationAvatar"
                :alt="stationName"
                class="block h-8 w-8 pt-0 sm:h-9 sm:w-9"
              />
              <div v-else class="flex h-8 w-8 items-center justify-center sm:h-9 sm:w-9">
                <UIcon name="i-mdi-hammer-screwdriver" class="h-5 w-5 text-white sm:h-6 sm:w-6" />
              </div>
            </span>
            <div class="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
              <span class="inline-block min-w-0 text-left leading-5 font-medium sm:leading-6">
                {{ stationName }}
              </span>
              <div
                v-if="showStatusBadge"
                data-help-target="hideout-help-demo-status"
                class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] leading-none font-semibold sm:px-2.5 sm:text-xs"
                :class="statusBadgeClasses"
              >
                <span class="whitespace-nowrap">
                  <template v-if="mode === 'locked'">
                    {{ t('page.hideout.stationcard.level_not_ready') }}
                  </template>
                  <template v-else>
                    <i18n-t
                      keypath="page.hideout.stationcard.level"
                      scope="global"
                      :plural="statusLevel"
                    >
                      <template #level>{{ statusLevel }}</template>
                    </i18n-t>
                  </template>
                </span>
              </div>
            </div>
          </div>
          <UButton
            icon="i-mdi-chevron-up"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="collapseLabel"
            class="mt-0.5 -mr-1 shrink-0 sm:mt-0"
            disabled
          />
        </div>
      </template>
      <template #content>
        <div v-if="showRequirementsPanel" class="space-y-2.5 sm:space-y-3">
          <div
            data-help-target="hideout-help-demo-requirements"
            class="bg-surface-800 relative rounded-lg p-2.5 sm:p-3"
          >
            <div class="mb-2.5 flex items-center text-sm font-medium sm:mb-3 sm:text-[15px]">
              <UIcon
                name="i-mdi-package-variant-closed-check"
                class="text-success-500 light:text-success-800 mr-1.5 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5"
              />
              {{ nextLevelLabel }}
            </div>
            <div
              class="mb-2.5 grid grid-cols-2 gap-2 sm:mb-3 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5"
            >
              <button
                v-if="primaryRequirement"
                type="button"
                data-help-target="hideout-help-demo-item"
                class="group border-surface-700 bg-surface-800/80 hover:border-surface-600 hover:bg-surface-800 relative flex flex-col items-center rounded-lg border p-1.5 text-left transition-all select-none hover:scale-105 sm:p-2"
                :class="[
                  primaryRequirementComplete ? 'border-success-500/50 bg-success-900/20' : '',
                  mode === 'available'
                    ? 'focus-visible:ring-primary-400/60 focus-visible:ring-2 focus-visible:outline-none'
                    : '',
                ]"
                :disabled="mode !== 'available'"
                @click="$emit('toggleRequirement')"
              >
                <div class="relative mb-1.5 h-14 w-14 shrink-0 sm:mb-2 sm:h-16 sm:w-16">
                  <GameItem
                    v-if="hasRequirementImage(primaryRequirement)"
                    :item-id="primaryRequirement.item.id"
                    :item-name="primaryRequirement.item.name"
                    :dev-link="primaryRequirement.item.link"
                    :wiki-link="primaryRequirement.item.wikiLink"
                    :icon-link="primaryRequirement.item.iconLink"
                    :image512px-link="primaryRequirement.item.image512pxLink"
                    :background-color="primaryRequirement.item.backgroundColor"
                    size="small"
                    :show-actions="false"
                    simple-mode
                  />
                  <div
                    v-else
                    class="bg-surface-800 flex h-full w-full items-center justify-center rounded"
                  >
                    <UIcon
                      name="i-mdi-package-variant"
                      class="text-surface-200 h-7 w-7 sm:h-8 sm:w-8"
                    />
                  </div>
                  <div
                    v-if="primaryRequirementComplete"
                    class="bg-success-500/40 absolute inset-0 flex items-center justify-center rounded"
                  >
                    <UIcon
                      name="i-mdi-check-circle"
                      class="text-success-300 h-6 w-6 sm:h-8 sm:w-8"
                    />
                  </div>
                  <div
                    v-if="primaryRequirement.count > 1"
                    class="absolute right-0 -bottom-1 left-0 flex justify-center"
                  >
                    <div
                      class="border-surface-700 bg-surface-900/90 rounded border px-1 py-0.5 text-[9px] font-bold sm:px-1.5 sm:text-[10px]"
                      :class="primaryRequirementComplete ? 'text-success-400' : 'text-surface-300'"
                    >
                      {{
                        formatRequirementProgress(primaryRequirement, primaryRequirementComplete)
                      }}
                    </div>
                  </div>
                </div>
                <div
                  class="text-surface-200 line-clamp-2 w-full text-center text-[11px] leading-tight font-medium sm:text-xs"
                >
                  {{ primaryRequirement.item.name }}
                </div>
              </button>
              <div
                v-for="requirement in secondaryRequirements"
                :key="requirement.id"
                class="group border-surface-700 bg-surface-800/80 hover:border-surface-600 hover:bg-surface-800 relative flex flex-col items-center rounded-lg border p-1.5 transition-all select-none hover:scale-105 sm:p-2"
              >
                <div class="relative mb-1.5 h-14 w-14 shrink-0 sm:mb-2 sm:h-16 sm:w-16">
                  <GameItem
                    v-if="hasRequirementImage(requirement)"
                    :item-id="requirement.item.id"
                    :item-name="requirement.item.name"
                    :dev-link="requirement.item.link"
                    :wiki-link="requirement.item.wikiLink"
                    :icon-link="requirement.item.iconLink"
                    :image512px-link="requirement.item.image512pxLink"
                    :background-color="requirement.item.backgroundColor"
                    size="small"
                    :show-actions="false"
                    simple-mode
                  />
                  <div
                    v-else
                    class="bg-surface-800 flex h-full w-full items-center justify-center rounded"
                  >
                    <UIcon
                      name="i-mdi-package-variant"
                      class="text-surface-200 h-7 w-7 sm:h-8 sm:w-8"
                    />
                  </div>
                  <div
                    v-if="requirement.count > 1"
                    class="absolute right-0 -bottom-1 left-0 flex justify-center"
                  >
                    <div
                      class="border-surface-700 bg-surface-900/90 text-surface-300 rounded border px-1 py-0.5 text-[9px] font-bold sm:px-1.5 sm:text-[10px]"
                    >
                      {{ formatRequirementProgress(requirement) }}
                    </div>
                  </div>
                </div>
                <div
                  class="text-surface-200 line-clamp-2 w-full text-center text-[11px] leading-tight font-medium sm:text-xs"
                >
                  {{ requirement.item.name }}
                </div>
              </div>
            </div>
            <div
              v-if="showPrerequisites"
              data-help-target="hideout-help-demo-prerequisites"
              class="border-surface-700 space-y-1.5 border-t pt-2.5 sm:space-y-2 sm:pt-3"
            >
              <div
                class="text-surface-400 mb-1.5 text-[11px] font-medium tracking-wider uppercase sm:mb-2 sm:text-xs"
              >
                {{ prerequisitesLabel }}
              </div>
              <div
                v-for="requirement in activeDemoLevel.stationLevelRequirements"
                :key="requirement.id"
                class="text-xs sm:text-sm"
              >
                <div class="text-error-400 flex items-center gap-1.5 font-semibold sm:gap-2">
                  <UIcon name="i-mdi-home" class="text-error-500 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <i18n-t keypath="page.hideout.stationcard.requirements.station" scope="global">
                    <template #level>{{ requirement.level }}</template>
                    <template #stationname>{{ requirement.station.name }}</template>
                  </i18n-t>
                  <UIcon
                    name="i-mdi-arrow-top-right"
                    class="h-3 w-3 shrink-0 opacity-75 sm:h-3.5 sm:w-3.5"
                  />
                </div>
              </div>
              <div
                v-for="requirement in activeDemoLevel.skillRequirements"
                :key="requirement.id"
                class="text-xs sm:text-sm"
              >
                <div class="text-error-400 flex items-center gap-1.5 font-semibold sm:gap-2">
                  <UIcon name="i-mdi-star" class="text-error-500 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <i18n-t keypath="page.hideout.stationcard.requirements.skill" scope="global">
                    <template #level>{{ requirement.level }}</template>
                    <template #skillname>{{ requirement.name }}</template>
                  </i18n-t>
                  <UIcon
                    name="i-mdi-arrow-top-right"
                    class="h-3 w-3 shrink-0 opacity-75 sm:h-3.5 sm:w-3.5"
                  />
                </div>
              </div>
              <div
                v-for="requirement in activeDemoLevel.traderRequirements"
                :key="requirement.id"
                class="text-xs sm:text-sm"
              >
                <div class="text-error-400 flex items-center gap-1.5 font-semibold sm:gap-2">
                  <UIcon
                    name="i-mdi-account-tie"
                    class="text-error-500 h-3.5 w-3.5 sm:h-4 sm:w-4"
                  />
                  <i18n-t keypath="page.hideout.stationcard.requirements.trader" scope="global">
                    <template #loyaltylevel>{{ requirement.value }}</template>
                    <template #tradername>{{ requirement.trader.name }}</template>
                  </i18n-t>
                  <UIcon
                    name="i-mdi-arrow-top-right"
                    class="h-3 w-3 shrink-0 opacity-75 sm:h-3.5 sm:w-3.5"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="bg-surface-800 rounded p-2.5 sm:p-3">
          <div
            class="text-warning-500 light:text-warning-800 flex items-center justify-center text-center text-sm font-medium sm:text-base"
          >
            <UIcon name="i-mdi-star-check" class="mr-1.5 h-5 w-5 sm:mr-2 sm:h-6 sm:w-6" />
            {{ maxedLabel }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="p-1.5 sm:p-2">
          <div v-if="showBuildButton" class="flex flex-col gap-1.5 sm:gap-2">
            <UButton
              data-help-target="hideout-help-demo-build"
              color="success"
              variant="solid"
              size="md"
              block
              :disabled="mode === 'locked'"
              :ui="upgradeButtonUi"
              @click="$emit('build')"
            >
              <i18n-t
                keypath="page.hideout.stationcard.upgrade_button"
                scope="global"
                :plural="buildLevel"
              >
                <template #level>{{ buildLevel }}</template>
              </i18n-t>
            </UButton>
          </div>
          <div
            v-else-if="showBuiltState"
            class="border-success-500/40 bg-success-950/30 rounded-lg border p-2.5 sm:p-3"
          >
            <div class="text-success-300 text-center text-sm font-semibold">
              {{ builtLabel }}
            </div>
          </div>
        </div>
      </template>
    </GenericCard>
  </div>
</template>
<script setup lang="ts">
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  import type { HideoutLevel, HideoutStation, ItemRequirement } from '@/types/tarkov';
  const GenericCard = defineAsyncComponent(() => import('@/components/ui/GenericCard.vue'));
  type HideoutHelpDemoMode = 'available' | 'built' | 'locked' | 'maxed';
  interface Props {
    mode: HideoutHelpDemoMode;
    requirementComplete: boolean;
  }
  const FALLBACK_DEMO_STATION: HideoutStation = {
    id: 'workbench',
    imageLink: '',
    levels: [
      {
        constructionTime: 0,
        crafts: [],
        id: 'workbench-level-1',
        itemRequirements: [
          {
            count: 2,
            id: 'demo-screw-nuts',
            item: {
              id: '',
              name: 'Screw nuts',
            },
            quantity: 2,
          },
          {
            count: 2,
            id: 'demo-bolts',
            item: {
              id: '',
              name: 'Bolts',
            },
            quantity: 2,
          },
          {
            count: 1,
            id: 'demo-leatherman',
            item: {
              id: '',
              name: 'Leatherman Multitool',
            },
            quantity: 1,
          },
          {
            count: 1,
            id: 'demo-roubles',
            item: {
              id: '',
              name: 'Roubles',
            },
            quantity: 1,
          },
        ],
        level: 1,
        skillRequirements: [],
        stationLevelRequirements: [],
        traderRequirements: [],
      },
      {
        constructionTime: 0,
        crafts: [],
        id: 'workbench-level-2',
        itemRequirements: [
          {
            count: 3,
            id: 'demo-light-bulbs',
            item: {
              id: '',
              name: 'Light bulb',
            },
            quantity: 3,
          },
          {
            count: 1,
            id: 'demo-toolset',
            item: {
              id: '',
              name: 'Toolset',
            },
            quantity: 1,
          },
        ],
        level: 2,
        skillRequirements: [
          {
            id: 'demo-skill-crafting',
            level: 2,
            name: 'Crafting',
            skill: {
              id: 'crafting',
              name: 'Crafting',
            },
          },
        ],
        stationLevelRequirements: [
          {
            id: 'demo-station-generator',
            level: 2,
            station: {
              id: 'generator',
              name: 'Generator',
            },
          },
        ],
        traderRequirements: [
          {
            id: 'demo-trader-mechanic',
            trader: {
              id: 'mechanic',
              name: 'Mechanic',
            },
            value: 2,
          },
        ],
      },
    ],
    name: 'Workbench',
    normalizedName: 'workbench',
  };
  const props = defineProps<Props>();
  defineEmits<{
    build: [];
    toggleRequirement: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const formatNumber = useLocaleNumberFormatter();
  const copy = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const hasLevelPrerequisites = (level: HideoutLevel) => {
    return (
      level.stationLevelRequirements.length > 0 ||
      level.skillRequirements.length > 0 ||
      level.traderRequirements.length > 0
    );
  };
  const hasRequirementImage = (requirement: ItemRequirement) => {
    return Boolean(requirement.item.iconLink || requirement.item.image512pxLink);
  };
  const formatRequirementProgress = (requirement: ItemRequirement, isComplete = false) => {
    return `${formatNumber(isComplete ? requirement.count : 0)}/${formatNumber(requirement.count)}`;
  };
  const demoLabel = computed(() => copy('page_help.hideout.demo.label', 'Guided preview'));
  const demoTitle = computed(() =>
    copy('page_help.hideout.demo.title', 'Hideout station walkthrough')
  );
  const demoSummary = computed(() =>
    copy(
      'page_help.hideout.demo.summary',
      'These actions are temporary. Closing help restores your real hideout progress and filters.'
    )
  );
  const safeLabel = computed(() => copy('page_help.hideout.demo.safe', 'No progress saved'));
  const collapseLabel = computed(() => copy('hideout.collapse', 'Collapse'));
  const nextLevelLabel = computed(() => t('page.hideout.stationcard.next_level'));
  const prerequisitesLabel = computed(() => t('page.hideout.stationcard.prerequisites'));
  const builtLabel = computed(() => copy('page_help.hideout.demo.built', 'Upgrade complete'));
  const maxedLabel = computed(() => t('page.hideout.stationcard.max_level'));
  const upgradeButtonUi = {
    base: 'bg-success-500 hover:bg-success-600 active:bg-success-700 text-white border border-success-700',
  };
  const fallbackAvailableDemoLevel = FALLBACK_DEMO_STATION.levels[0] as HideoutLevel;
  const fallbackLockedDemoLevel =
    (FALLBACK_DEMO_STATION.levels[1] as HideoutLevel | undefined) ?? fallbackAvailableDemoLevel;
  const hideoutStations = computed<HideoutStation[]>(
    () => unref(metadataStore.hideoutStations) ?? []
  );
  const demoStation = computed(() => {
    const stations = hideoutStations.value;
    return (
      stations.find(
        (station) =>
          station.normalizedName === 'workbench' &&
          station.levels.some((level) => level.itemRequirements.length > 0)
      ) ??
      stations.find((station) =>
        station.levels.some((level) => level.itemRequirements.length > 0)
      ) ??
      FALLBACK_DEMO_STATION
    );
  });
  const availableDemoLevel = computed<HideoutLevel>(() => {
    return (
      demoStation.value.levels.find(
        (level) => level.level === 1 && level.itemRequirements.length > 0
      ) ??
      demoStation.value.levels.find((level) => level.itemRequirements.length > 0) ??
      fallbackAvailableDemoLevel
    );
  });
  const lockedDemoLevel = computed<HideoutLevel>(() => {
    return (
      demoStation.value.levels.find(
        (level) =>
          level.level === 2 && level.itemRequirements.length > 0 && hasLevelPrerequisites(level)
      ) ??
      demoStation.value.levels.find(
        (level) => level.itemRequirements.length > 0 && hasLevelPrerequisites(level)
      ) ??
      fallbackLockedDemoLevel
    );
  });
  const activeDemoLevel = computed<HideoutLevel>(() => {
    return props.mode === 'locked' ? lockedDemoLevel.value : availableDemoLevel.value;
  });
  const stationName = computed(() => demoStation.value.name || FALLBACK_DEMO_STATION.name);
  const stationAvatar = computed(() => demoStation.value.imageLink || '');
  const primaryRequirement = computed(() => activeDemoLevel.value.itemRequirements[0] ?? null);
  const secondaryRequirements = computed(() => activeDemoLevel.value.itemRequirements.slice(1));
  const showPrerequisites = computed(
    () => props.mode === 'locked' && hasLevelPrerequisites(activeDemoLevel.value)
  );
  const showRequirementsPanel = computed(() => props.mode !== 'maxed');
  const showBuildButton = computed(() => props.mode === 'available' || props.mode === 'locked');
  const showBuiltState = computed(() => props.mode === 'built');
  const showStatusBadge = computed(() => props.mode !== 'maxed');
  const primaryRequirementComplete = computed(
    () => props.mode !== 'locked' && props.requirementComplete
  );
  const statusLevel = computed(() => {
    if (props.mode === 'built') {
      return availableDemoLevel.value.level;
    }
    return Math.max(availableDemoLevel.value.level - 1, 0);
  });
  const buildLevel = computed(() => activeDemoLevel.value.level || 1);
  const highlightColor = computed<'error' | 'primary' | 'success'>(() => {
    if (props.mode === 'maxed') return 'primary';
    return props.mode === 'locked' ? 'error' : 'success';
  });
  const highlightClasses = computed(() => {
    if (highlightColor.value === 'primary') {
      return { 'bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600': true };
    }
    if (highlightColor.value === 'error') {
      return { 'bg-gradient-to-br from-error-800 via-error-700 to-error-600': true };
    }
    return { 'bg-gradient-to-br from-success-800 via-success-700 to-success-600': true };
  });
  const statusBadgeClasses = computed(() => {
    if (props.mode === 'locked') {
      return 'border-error-500/50 bg-error-500/20 text-error-400';
    }
    return 'bg-success-500/20 border-success-500/50 text-success-400';
  });
  const mode = computed(() => props.mode);
</script>
