<template>
  <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-[1400px] space-y-4">
      <div class="flex flex-col gap-4">
        <div class="flex justify-center">
          <div
            class="bg-surface-900 border-surface-700/50 w-full max-w-4xl rounded-lg border px-4 py-3 shadow-sm"
          >
            <div class="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div></div>
              <div class="flex flex-wrap justify-center gap-2">
                <template v-for="(view, index) in primaryViews" :key="view.view">
                  <UButton
                    :icon="`i-${view.icon}`"
                    :variant="'ghost'"
                    :color="'neutral'"
                    size="md"
                    class="shrink-0"
                    :class="{
                      'border-surface-200 rounded-none border-b-2': activePrimaryView === view.view,
                    }"
                    @click="activePrimaryView = view.view"
                  >
                    <span class="text-xs sm:text-sm">{{ view.title.toUpperCase() }}</span>
                    <span
                      :class="[
                        'ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold text-white sm:h-7 sm:min-w-7 sm:px-1.5 sm:text-sm',
                        view.badgeColor,
                      ]"
                    >
                      {{ view.count }}
                    </span>
                  </UButton>
                  <span
                    v-if="index === 0"
                    aria-hidden="true"
                    class="bg-surface-700/60 h-6 w-px self-center"
                  ></span>
                </template>
              </div>
              <div class="flex justify-end">
                <UPopover>
                  <UButton
                    icon="i-mdi-cog"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :aria-label="t('settings.title')"
                  >
                    <span class="hidden sm:inline">
                      {{ t('settings.title').toUpperCase() }}
                    </span>
                  </UButton>
                  <template #content>
                    <div class="w-64 space-y-3 p-3">
                      <UCheckbox
                        v-model="preferencesStore.hideoutCollapseCompleted"
                        :label="
                          $t('page.hideout.collapse_completed') || 'Collapse completed stations'
                        "
                        color="success"
                      />
                      <UCheckbox
                        v-model="preferencesStore.hideoutSortReadyFirst"
                        :label="$t('page.hideout.sort.ready_first') || 'Sort ready to build first'"
                        color="info"
                      />
                      <div class="border-surface-700/60 space-y-2 border-t pt-3">
                        <div
                          class="text-surface-400 text-xs font-semibold tracking-wider uppercase"
                        >
                          {{
                            $t('page.hideout.prereq_filters.title') || 'Availability requirements'
                          }}
                        </div>
                        <UCheckbox
                          :model-value="preferencesStore.hideoutRequireStationLevels"
                          :label="
                            $t('page.hideout.prereq_filters.station_levels') ||
                            'Require station levels'
                          "
                          @update:model-value="
                            (value) => handlePrereqToggle('station', Boolean(value))
                          "
                        />
                        <UCheckbox
                          :model-value="preferencesStore.hideoutRequireSkillLevels"
                          :label="
                            $t('page.hideout.prereq_filters.skill_levels') || 'Require skill levels'
                          "
                          @update:model-value="
                            (value) => handlePrereqToggle('skill', Boolean(value))
                          "
                        />
                        <UCheckbox
                          :model-value="preferencesStore.hideoutRequireTraderLoyalty"
                          :label="
                            $t('page.hideout.prereq_filters.trader_loyalty') ||
                            'Require trader loyalty'
                          "
                          @update:model-value="
                            (value) => handlePrereqToggle('trader', Boolean(value))
                          "
                        />
                      </div>
                    </div>
                  </template>
                </UPopover>
              </div>
            </div>
          </div>
        </div>
      </div>
      <UModal
        v-model:open="showPrereqConfirm"
        :title="prereqConfirmTitle"
        :description="prereqConfirmDescription"
        :ui="{ content: 'bg-transparent border-0 p-0 shadow-none ring-0 outline-none' }"
        prevent-close
      >
        <template #content>
          <UCard class="w-full max-w-sm">
            <template #header>
              <div class="px-4 py-3 text-lg font-semibold text-white">
                {{ prereqConfirmTitle }}
              </div>
            </template>
            <div class="text-surface-300 px-4 pb-4 text-sm">
              {{ prereqConfirmDescription }}
            </div>
            <template #footer>
              <div class="flex justify-end gap-2 px-4 pb-4">
                <UButton color="neutral" variant="ghost" @click="cancelPrereqToggle">
                  {{ $t('page.hideout.prereq_filters.confirm_cancel') || 'Cancel' }}
                </UButton>
                <UButton color="warning" variant="solid" @click="confirmPrereqToggle">
                  {{ $t('page.hideout.prereq_filters.confirm_confirm') || 'Enable' }}
                </UButton>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>
      <div>
        <div v-if="isStoreLoading" class="text-surface-200 flex flex-col items-center gap-3 py-10">
          <UIcon name="i-heroicons-arrow-path" class="text-info-400 h-8 w-8 animate-spin" />
          <div class="flex items-center gap-2 text-sm">
            {{ $t('page.hideout.loading') }}
            <RefreshButton />
          </div>
        </div>
        <div v-else-if="visibleStations.length === 0" class="flex justify-center">
          <UAlert
            icon="i-mdi-clipboard-search"
            color="neutral"
            variant="soft"
            class="max-w-xl"
            :title="$t('page.hideout.no_stations_found')"
          />
        </div>
        <div v-else class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="(hStation, hIndex) in visibleStationsSlice"
            :key="hIndex"
            class="content-visibility-auto-240 h-full"
          >
            <HideoutCard
              :station="hStation"
              :collapsed="
                getStationStatus(hStation) === 'maxed' && preferencesStore.hideoutCollapseCompleted
              "
              :highlighted="highlightedStationId === hStation.id"
              :highlight-module-id="
                highlightedStationId === hStation.id ? highlightedModuleId : undefined
              "
            />
          </div>
        </div>
        <div
          v-if="visibleStationCount < visibleStations.length"
          ref="loadMoreSentinel"
          class="flex items-center justify-center py-4"
        >
          <UIcon name="i-mdi-loading" class="text-surface-400 h-5 w-5 animate-spin" />
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useDebounceFn } from '@vueuse/core';
  import { storeToRefs } from 'pinia';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { type HideoutPrimaryView, useHideoutFiltering } from '@/composables/useHideoutFiltering';
  import { useHideoutStationStatus } from '@/composables/useHideoutStationStatus';
  import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
  import { usePrereqModal, type PrereqType } from '@/composables/usePrereqModal';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { useTarkovStore } from '@/stores/useTarkov';
  // Page metadata
  useSeoMeta({
    title: 'Hideout',
    description:
      'Track your hideout module upgrades and requirements. See what items you need to complete each station upgrade.',
  });
  const HideoutCard = defineAsyncComponent(() => import('@/features/hideout/HideoutCard.vue'));
  const RefreshButton = defineAsyncComponent(() => import('@/components/ui/RefreshButton.vue'));
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n({ useScope: 'global' });
  const metadataStore = useMetadataStore();
  const { hideoutStations } = storeToRefs(metadataStore);
  const preferencesStore = usePreferencesStore();
  const tarkovStore = useTarkovStore();
  const { getStationStatus } = useHideoutStationStatus();
  const highlightedStationId = ref<string | null>(null);
  const highlightedModuleId = ref<string | null>(null);
  const prereqPreferenceSetters = {
    station: (value: boolean) => preferencesStore.setHideoutRequireStationLevels(value),
    skill: (value: boolean) => preferencesStore.setHideoutRequireSkillLevels(value),
    trader: (value: boolean) => preferencesStore.setHideoutRequireTraderLoyalty(value),
  } satisfies Record<'station' | 'skill' | 'trader', (value: boolean) => void>;
  const setPrereqPreference = (key: 'station' | 'skill' | 'trader', enabled: boolean) => {
    const setter = prereqPreferenceSetters[key];
    if (!setter) return;
    setter(enabled);
  };
  const HIDEOUT_PREREQS_ENFORCED_STORAGE_KEY = 'hideout-prereqs-enforced';
  const hasEnforcedPrereqs = useState<boolean>('hideout-prereqs-enforced', () => false);
  if (import.meta.client) {
    hasEnforcedPrereqs.value =
      localStorage.getItem(HIDEOUT_PREREQS_ENFORCED_STORAGE_KEY) === 'true';
  }
  const setHasEnforcedPrereqs = (value: boolean) => {
    hasEnforcedPrereqs.value = value;
    if (!import.meta.client) return;
    localStorage.setItem(HIDEOUT_PREREQS_ENFORCED_STORAGE_KEY, value ? 'true' : 'false');
  };
  const {
    showPrereqConfirm,
    pendingPrereqToggle,
    handlePrereqToggle,
    cancelPrereqToggle,
    confirmPrereqToggle,
  } = usePrereqModal({
    onConfirm: (key: PrereqType) => {
      setPrereqPreference(key, true);
      tarkovStore.enforceHideoutPrereqsNow();
      setHasEnforcedPrereqs(true);
    },
    setPreference: setPrereqPreference,
  });
  // Hideout filtering composable
  const { activePrimaryView, isStoreLoading, visibleStations, stationCounts } =
    useHideoutFiltering();
  const BATCH_SIZE = 9;
  const visibleStationCount = ref(BATCH_SIZE);
  const loadMoreSentinel = ref<HTMLElement | null>(null);
  const visibleStationsSlice = computed(() =>
    visibleStations.value.slice(0, visibleStationCount.value)
  );
  const hasMoreStations = computed(() => visibleStationCount.value < visibleStations.value.length);
  const loadMoreStations = () => {
    if (!hasMoreStations.value) return;
    visibleStationCount.value = Math.min(
      visibleStationCount.value + BATCH_SIZE,
      visibleStations.value.length
    );
  };
  const { checkAndLoadMore } = useInfiniteScroll(loadMoreSentinel, loadMoreStations, {
    enabled: hasMoreStations,
    maxAutoLoads: 8,
    rootMargin: '700px',
  });
  const debouncedCheckAndLoadMore = useDebounceFn(() => {
    void nextTick(() => {
      checkAndLoadMore();
    });
  }, 50);
  watch(visibleStations, (newStations) => {
    if (visibleStationCount.value > newStations.length) {
      visibleStationCount.value = newStations.length;
    }
    debouncedCheckAndLoadMore();
  });
  type HideoutPrimaryViewOption = {
    badgeColor: string;
    count: number;
    icon: string;
    title: string;
    view: HideoutPrimaryView;
  };
  const primaryViews = computed<HideoutPrimaryViewOption[]>(() => [
    {
      title: t('page.hideout.primary_views.all'),
      icon: 'mdi-clipboard-check',
      view: 'all',
      count: stationCounts.value.all,
      badgeColor: 'bg-secondary-600',
    },
    {
      title: t('page.hideout.primary_views.available'),
      icon: 'mdi-tag-arrow-up-outline',
      view: 'available',
      count: stationCounts.value.available,
      badgeColor: 'bg-info-600',
    },
    {
      title: t('page.hideout.primary_views.locked'),
      icon: 'mdi-lock',
      view: 'locked',
      count: stationCounts.value.locked,
      badgeColor: 'bg-surface-600',
    },
    {
      title: t('page.hideout.primary_views.maxed'),
      icon: 'mdi-arrow-collapse-up',
      view: 'maxed',
      count: stationCounts.value.maxed,
      badgeColor: 'bg-success-600',
    },
  ]);
  const prereqLabels = computed(() => ({
    station: t('page.hideout.prereq_filters.station_levels') || 'Require station levels',
    skill: t('page.hideout.prereq_filters.skill_levels') || 'Require skill levels',
    trader: t('page.hideout.prereq_filters.trader_loyalty') || 'Require trader loyalty',
  }));
  const pendingPrereqLabel = computed(() => {
    if (!pendingPrereqToggle.value) return '';
    return prereqLabels.value[pendingPrereqToggle.value];
  });
  const shouldEnforcePrereqs = computed(
    () =>
      preferencesStore.hideoutRequireStationLevels ||
      preferencesStore.hideoutRequireSkillLevels ||
      preferencesStore.hideoutRequireTraderLoyalty
  );
  const prereqConfirmTitle = computed(
    () => t('page.hideout.prereq_filters.confirm_title') || 'Enable availability requirement?'
  );
  const prereqConfirmDescription = computed(
    () =>
      t('page.hideout.prereq_filters.confirm_description', {
        requirement: pendingPrereqLabel.value,
      }) ||
      'Enabling this requirement may remove hideout upgrades that no longer meet prerequisites.'
  );
  watch(
    [isStoreLoading, shouldEnforcePrereqs],
    ([loading, shouldEnforce]) => {
      if (loading) return;
      if (!shouldEnforce) {
        setHasEnforcedPrereqs(false);
        return;
      }
      if (hasEnforcedPrereqs.value) return;
      tarkovStore.enforceHideoutPrereqsNow();
      setHasEnforcedPrereqs(true);
    },
    { immediate: true }
  );
  // Handle deep linking to a specific station via ?station=stationId query param
  const scrollToStation = async (stationId: string) => {
    await nextTick();
    setTimeout(() => {
      const stationElement = document.getElementById(`station-${stationId}`);
      if (stationElement) {
        stationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };
  const handleStationQueryParam = () => {
    const stationQuery = route.query.station;
    const moduleQuery = route.query.module;
    const stationId = Array.isArray(stationQuery) ? stationQuery[0] : stationQuery;
    const moduleId = Array.isArray(moduleQuery) ? moduleQuery[0] : moduleQuery;
    if (!stationId || isStoreLoading.value) return;
    // Determine station status and set appropriate filter
    const station = hideoutStations.value?.find((s) => s.id === stationId);
    const status = station ? getStationStatus(station) : 'locked';
    if (activePrimaryView.value !== status) {
      activePrimaryView.value = status;
    }
    highlightedStationId.value = stationId;
    highlightedModuleId.value = moduleId || null;
    // Scroll to the station after filters are applied
    scrollToStation(stationId);
    // Clear the query param to avoid re-triggering on filter changes
    router.replace({ path: '/hideout', query: {} });
  };
  // Watch for station query param and handle it when data is loaded
  watch(
    [() => route.query.station, () => route.query.module, isStoreLoading],
    ([stationQueryParam, moduleQueryParam, loading]) => {
      if ((stationQueryParam || moduleQueryParam) && !loading) {
        handleStationQueryParam();
      }
    },
    { immediate: true }
  );
</script>
