<template>
  <section
    class="border-surface-700 bg-surface-900 grid overflow-hidden rounded-lg border lg:grid-cols-3"
    :aria-label="t('page.hideout.map.title')"
  >
    <div class="min-w-0 lg:col-span-2">
      <HideoutMapCanvas
        ref="canvas"
        :entries="entries"
        :active-area="area"
        :selected-id="selected?.station.id"
        @area="openArea"
        @station="openStation"
        @reset="clearSelection"
      />
      <p class="text-surface-400 px-3 py-2 text-xs">{{ t('page.hideout.map.navigation') }}</p>
    </div>
    <section
      ref="details"
      :aria-label="selected?.station.name ?? t('page.hideout.map.upgrades')"
      tabindex="-1"
      class="border-surface-700 space-y-3 border-t p-3 lg:border-t-0 lg:border-l"
    >
      <UButton
        v-if="area || selected"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-mdi-arrow-left"
        @click="back"
      >
        {{ selected && area ? t(AREA_LABELS[area]) : t('page.hideout.map.upgrades') }}
      </UButton>
      <template v-if="selected">
        <p class="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <UIcon :name="STATE_ICONS[selected.state]" class="size-4" />
          <strong>{{ t(STATE_LABELS[selected.state]) }}</strong>
          <span v-if="selected.reason" class="text-surface-400">{{ selected.reason }}</span>
        </p>
        <HideoutCard :key="selected.station.id" :station="selected.station" inline-materials />
      </template>
      <template v-else>
        <h2 class="text-lg font-semibold">
          {{ area ? t(AREA_LABELS[area]) : t('page.hideout.map.upgrades') }}
        </h2>
        <HideoutUpgradeDirectory :entries="inArea" :area="area" @station="openStation" />
      </template>
    </section>
  </section>
</template>
<script setup lang="ts">
  import HideoutCard from '@/features/hideout/HideoutCard.vue';
  import HideoutMapCanvas from '@/features/hideout/HideoutMapCanvas.vue';
  import { AREA_LABELS, type HideoutArea } from '@/features/hideout/hideoutMapLayout';
  import HideoutUpgradeDirectory from '@/features/hideout/HideoutUpgradeDirectory.vue';
  import {
    STATE_LABELS,
    STATE_ICONS,
    useHideoutMapStations,
  } from '@/features/hideout/useHideoutMapStations';
  import type { HideoutStation } from '@/types/tarkov';
  const props = defineProps<{ stations: HideoutStation[] }>();
  const { t } = useI18n({ useScope: 'global' });
  const entries = useHideoutMapStations(() => props.stations);
  const canvas = useTemplateRef<{
    focusStation: (id: string) => void;
    focusArea: (area: HideoutArea) => void;
    reset: () => void;
  }>('canvas');
  const details = useTemplateRef<HTMLElement>('details');
  const area = ref<HideoutArea | null>(null);
  const stationId = ref<string | null>(null);
  const selected = computed(() =>
    entries.value.find((entry) => entry.station.id === stationId.value)
  );
  const inArea = computed(() =>
    entries.value.filter((entry) => !area.value || entry.pin?.area === area.value)
  );
  function openArea(next: HideoutArea) {
    area.value = next;
    stationId.value = null;
    canvas.value?.focusArea(next);
  }
  async function openStation(id: string) {
    if (area.value)
      area.value = entries.value.find((entry) => entry.station.id === id)?.pin?.area ?? null;
    stationId.value = id;
    canvas.value?.focusStation(id);
    await nextTick();
    details.value?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width: 1023px)').matches)
      details.value?.scrollIntoView({ block: 'start' });
  }
  function clearSelection() {
    stationId.value = null;
    area.value = null;
  }
  function back() {
    if (selected.value) {
      stationId.value = null;
      return;
    }
    clearSelection();
    canvas.value?.reset();
  }
</script>
