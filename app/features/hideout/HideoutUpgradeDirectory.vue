<template>
  <div>
    <details
      v-for="group in groups"
      :key="(area ?? 'all') + group.state"
      :open="expanded(group)"
      class="border-surface-700 border-t"
    >
      <summary class="flex min-h-11 cursor-pointer items-center gap-2 py-2 font-semibold">
        <UIcon
          :name="STATE_ICONS[group.state]"
          class="size-4"
          :class="group.state === 'ready' ? 'text-success-400' : 'text-surface-400'"
        />
        {{ t(STATE_LABELS[group.state]) }}
        <span class="text-surface-400 ml-auto text-sm tabular-nums">
          {{ group.entries.length }}
        </span>
        <UIcon name="i-mdi-chevron-down" class="size-4" />
      </summary>
      <button
        v-for="entry in group.entries"
        :key="entry.station.id"
        type="button"
        class="border-surface-700 hover:bg-surface-800 flex min-h-11 w-full items-center justify-between gap-2 border-t px-2 py-1.5 text-left"
        @click="emit('station', entry.station.id)"
      >
        <span>
          <strong class="block text-sm">{{ entry.station.name }}</strong>
          <span v-if="entry.reason" class="text-surface-400 block text-xs">
            {{ entry.reason }}
          </span>
        </span>
        <span class="text-surface-400 shrink-0 text-xs">{{ levelLabel(entry) }}</span>
      </button>
    </details>
  </div>
</template>
<script setup lang="ts">
  import {
    STATE_ICONS,
    STATE_LABELS,
    UPGRADE_STATES,
    type UpgradeState,
    type HideoutMapStation,
  } from '@/features/hideout/useHideoutMapStations';
  import type { HideoutArea } from '@/features/hideout/hideoutMapLayout';
  const props = defineProps<{ entries: HideoutMapStation[]; area: HideoutArea | null }>();
  const emit = defineEmits<{ station: [id: string] }>();
  const { t } = useI18n({ useScope: 'global' });
  const groups = computed(() =>
    UPGRADE_STATES.map((state) => ({
      state,
      entries: props.entries.filter((entry) => entry.state === state),
    }))
  );
  const firstPopulated = computed(() => groups.value.find((group) => group.entries.length)?.state);
  const expanded = (group: { state: UpgradeState; entries: HideoutMapStation[] }) =>
    group.entries.length > 0 && (props.area !== null || group.state === firstPopulated.value);
  const levelLabel = (entry: HideoutMapStation) =>
    entry.level
      ? t('page.hideout.map.level', { level: entry.level })
      : t('page.hideout.map.not_built');
</script>
