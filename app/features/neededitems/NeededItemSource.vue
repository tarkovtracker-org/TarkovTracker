<template>
  <div class="flex min-w-0 flex-col gap-1 text-xs" :class="align.column">
    <div class="flex max-w-full min-w-0 items-center gap-1.5" :class="align.row">
      <NuxtLink v-if="link.to" :to="link.to" :class="linkClass">
        <img
          v-if="link.icon"
          :src="link.icon"
          alt=""
          class="size-4 shrink-0"
          :class="link.round ? 'rounded-full' : ''"
          loading="lazy"
        />
        <span class="truncate">{{ link.name }}</span>
      </NuxtLink>
      <span v-else class="text-surface-400 truncate">{{ link.name }}</span>
      <span v-if="link.level" class="text-surface-400 shrink-0">{{ link.level }}</span>
    </div>
    <div
      v-if="hasDetails"
      class="text-surface-400 flex flex-wrap items-center gap-x-3 gap-y-1"
      :class="align.row"
    >
      <NeededItemStatusPill
        v-if="showStatus"
        :handed-over="handedOver"
        :collected="collected"
        :hidden-for-self="hiddenForSelf"
        :hint="hiddenForSelfHint"
      />
      <RequirementInfo
        :level-required="levelRequired"
        :locked-before="lockedBefore"
        :player-level="playerLevel"
        icon-class="size-3.5"
      />
      <TeamNeedsDisplay
        v-if="teamNeeds.length"
        :team-needs="teamNeeds"
        :needed-count="neededCount"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
  import NeededItemStatusPill from '@/features/neededitems/NeededItemStatusPill.vue';
  import RequirementInfo from '@/features/neededitems/RequirementInfo.vue';
  import TeamNeedsDisplay from '@/features/neededitems/TeamNeedsDisplay.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  import type { NeededItemTeamNeed } from '@/features/neededitems/neededitem-keys';
  import type {
    HideoutStation,
    NeededItemHideoutModule,
    NeededItemTaskObjective,
    Task,
  } from '@/types/tarkov';
  /** Where a need comes from, plus anything that blocks or changes it. Same in every layout. */
  const props = withDefaults(
    defineProps<{
      need: NeededItemTaskObjective | NeededItemHideoutModule;
      relatedTask: Task | null;
      relatedStation: HideoutStation | null;
      levelRequired: number;
      lockedBefore: number;
      neededCount: number;
      teamNeeds: NeededItemTeamNeed[];
      hiddenForSelf: boolean;
      hiddenForSelfHint: string;
      handedOver: boolean;
      /** Collected but not turned in yet: the cue to go hand it over. Quest needs only. */
      collected?: boolean;
      centered?: boolean;
    }>(),
    { collected: false, centered: false }
  );
  const tarkovStore = useTarkovStore();
  const { t } = useI18n({ useScope: 'global' });
  const playerLevel = computed(() => tarkovStore.playerLevel());
  // Names stay visible at every width; the icon is a small leading marker.
  const linkClass =
    'text-link hover:text-link-hover flex min-w-0 items-center gap-1.5 font-semibold no-underline';
  const align = computed(() =>
    props.centered ? { column: 'items-center', row: 'justify-center' } : { column: '', row: '' }
  );
  type SourceLink = {
    to?: { path: string; query: Record<string, string | undefined> };
    icon?: string;
    round?: boolean;
    name: string;
    level?: string;
  };
  function taskSource(): SourceLink {
    const task = props.relatedTask;
    if (!task) return { name: t('needed_items.unknown_task') };
    return {
      to: { path: '/tasks', query: { task: task.id } },
      icon: task.trader?.imageLink || '/img/default-avatar.svg',
      round: true,
      name: task.name ?? t('needed_items.unknown_task'),
    };
  }
  function stationSource(need: NeededItemHideoutModule): SourceLink {
    const { stationId, id, level } = need.hideoutModule;
    const station = props.relatedStation;
    const levelText = t('common.lvl_level', { level });
    if (!station) return { name: t('needed_items.unknown_station'), level: levelText };
    return {
      to: { path: '/hideout', query: { station: stationId, module: id } },
      icon: station.imageLink,
      name: station.name,
      level: levelText,
    };
  }
  /** One description for either source, so the template has a single link shape. */
  const link = computed(() =>
    props.need.needType === 'taskObjective' ? taskSource() : stationSource(props.need)
  );
  const showStatus = computed(() => props.hiddenForSelf || props.handedOver || props.collected);
  const isLevelLocked = computed(
    () => props.levelRequired > 0 && props.levelRequired > playerLevel.value
  );
  const hasDetails = computed(
    () =>
      showStatus.value ||
      isLevelLocked.value ||
      props.lockedBefore > 0 ||
      props.teamNeeds.length > 0
  );
</script>
