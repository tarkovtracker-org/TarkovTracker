<template>
  <v-container class="d-flex flex-column" style="min-height: calc(100vh - 250px)">
    <tracker-tip :tip="{ id: 'hideout' }" style="flex: 0 0 auto" class="mb-4"></tracker-tip>
    <div class="flex-grow-0" style="margin-bottom: 16px">
      <v-row justify="center">
        <v-col lg="8" md="12">
          <v-card>
            <v-tabs
              v-model="activePrimaryView"
              bg-color="accent"
              slider-color="secondary"
              align-tabs="center"
              show-arrows
            >
              <v-tab
                v-for="(view, index) in primaryViews"
                :key="index"
                :value="view.view"
                :prepend-icon="view.icon"
              >
                {{ view.title }}
              </v-tab>
            </v-tabs>
          </v-card>
        </v-col>
      </v-row>
    </div>
    <div class="flex-grow-1">
      <v-row v-if="hideoutLoading" justify="center">
        <v-col cols="12" align="center">
          <v-progress-circular indeterminate color="secondary" class="mx-2"></v-progress-circular>
          {{ $t('page.hideout.loading') }} <refresh-button />
        </v-col>
      </v-row>
      <v-row justify="center" class="mt-2">
        <v-col
          v-for="(hStation, hIndex) in visibleStations"
          :key="hIndex"
          cols="12"
          sm="12"
          md="6"
          lg="6"
          xl="4"
        >
          <hideout-card :station="hStation" class="ma-2" />
        </v-col>
      </v-row>
      <v-row v-if="!hideoutLoading && visibleStations.length == 0">
        <v-col cols="12">
          <v-alert icon="mdi-clipboard-search"> {{ $t('page.hideout.nostationsfound') }}</v-alert>
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>
<script setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useTarkovData } from '@/composables/tarkovdata';
  import { useProgressStore } from '@/stores/progress';
  import { useUserStore } from '@/stores/user';
  import { defineAsyncComponent } from 'vue';
  const TrackerTip = defineAsyncComponent(() => import('@/components/TrackerTip'));
  const HideoutCard = defineAsyncComponent(() => import('@/components/hideout/HideoutCard'));
  const RefreshButton = defineAsyncComponent(() => import('@/components/RefreshButton'));
  const { t } = useI18n({ useScope: 'global' });
  const { hideoutStations, hideoutLoading } = useTarkovData();
  const progressStore = useProgressStore();
  const userStore = useUserStore();
  const primaryViews = [
    {
      title: t('page.hideout.primaryviews.available'),
      icon: 'mdi-tag-arrow-up-outline',
      view: 'available',
    },
    {
      title: t('page.hideout.primaryviews.maxed'),
      icon: 'mdi-arrow-collapse-up',
      view: 'maxed',
    },
    {
      title: t('page.hideout.primaryviews.locked'),
      icon: 'mdi-lock',
      view: 'locked',
    },
    {
      title: t('page.hideout.primaryviews.all'),
      icon: 'mdi-clipboard-check',
      view: 'all',
    },
  ];
  const activePrimaryView = computed({
    get: () => userStore.getTaskPrimaryView,
    set: (value) => userStore.setTaskPrimaryView(value),
  });
  const visibleStations = computed(() => {
    let hideoutStationList = JSON.parse(JSON.stringify(hideoutStations.value));
    //Display all upgradeable stations
    if (activePrimaryView.value === 'available')
      return hideoutStationList.filter((station) => {
        const lvl = progressStore.hideoutLevels?.[station.id]?.self || 0;
        const nextLevelData = station.levels.find((l) => l.level === lvl + 1);
        if (!nextLevelData) return false;
        return nextLevelData.stationLevelRequirements.every(
          (req) => (progressStore.hideoutLevels?.[req.station.id]?.self || 0) >= req.level
        );
      });
    //Display all maxed stations
    if (activePrimaryView.value === 'maxed')
      return hideoutStationList.filter(
        (station) =>
          (progressStore.hideoutLevels?.[station.id]?.self || 0) === station.levels.length
      );
    //Display all locked stations
    if (activePrimaryView.value === 'locked')
      return hideoutStationList.filter((station) => {
        const lvl = progressStore.hideoutLevels?.[station.id]?.self || 0;
        const nextLevelData = station.levels.find((l) => l.level === lvl + 1);
        if (!nextLevelData) return false;
        return !nextLevelData.stationLevelRequirements.every(
          (req) => (progressStore.hideoutLevels?.[req.station.id]?.self || 0) >= req.level
        );
      });
    //Display all stations
    if (activePrimaryView.value === 'all') return hideoutStationList;
    return hideoutStationList;
  });
</script>
<style lang="scss" scoped></style>
