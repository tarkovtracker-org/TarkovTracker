<template>
  <div
    class="scrollbar-none flex flex-wrap items-center gap-1.5 sm:flex-nowrap sm:justify-end sm:overflow-x-auto"
  >
    <AppTooltip
      :text="isPinned ? t('page.tasks.questcard.unpin_task') : t('page.tasks.questcard.pin_task')"
    >
      <UButton
        size="xs"
        variant="ghost"
        :color="isPinned ? 'primary' : 'neutral'"
        :icon="isPinned ? 'i-mdi-pin' : 'i-mdi-pin-outline'"
        class="shrink-0"
        :aria-label="
          isPinned ? t('page.tasks.questcard.unpin_task') : t('page.tasks.questcard.pin_task')
        "
        @click.stop="emit('togglePin')"
      />
    </AppTooltip>
    <AppTooltip
      v-if="(task.minPlayerLevel ?? 0) > 0"
      :text="
        t(
          'page.tasks.questcard.level_badge_tooltip',
          { level: task.minPlayerLevel },
          `Minimum player level ${task.minPlayerLevel} required to unlock this quest`
        )
      "
    >
      <UBadge
        size="xs"
        :color="meetsLevelRequirement ? 'success' : 'error'"
        variant="soft"
        class="shrink-0 cursor-help text-[11px]"
      >
        {{ t('page.tasks.questcard.level_badge', { count: task.minPlayerLevel }) }}
      </UBadge>
    </AppTooltip>
    <AppTooltip
      v-if="props.fenceRepRequirement"
      :text="
        t(
          'page.tasks.questcard.fence_rep_tooltip',
          { rep: formattedFenceRep },
          `Requires Fence reputation of ${props.fenceRepRequirement.value >= 0 ? 'at least' : 'at most'} ${props.fenceRepRequirement.value}`
        )
      "
    >
      <UBadge
        size="xs"
        :color="meetsFenceRepRequirement ? 'success' : 'error'"
        variant="soft"
        class="shrink-0 cursor-help text-[11px]"
      >
        {{ t('page.tasks.questcard.fence_rep_badge', { rep: formattedFenceRep }) }}
      </UBadge>
    </AppTooltip>
    <AppTooltip
      v-for="req in traderLevelReqs"
      :key="req.id"
      :text="
        t(
          'page.tasks.questcard.trader_level_tooltip',
          { trader: req.trader.name, level: req.level },
          `Requires ${req.trader.name} Loyalty Level ${req.level}`
        )
      "
    >
      <UBadge
        size="xs"
        :color="req.met ? 'success' : 'error'"
        variant="soft"
        class="shrink-0 cursor-help text-[11px]"
      >
        {{
          t('page.tasks.questcard.trader_level_badge', {
            trader: req.trader.name,
            level: req.level,
          })
        }}
      </UBadge>
    </AppTooltip>
    <AppTooltip :text="locationTooltip">
      <UBadge
        size="xs"
        color="neutral"
        variant="soft"
        class="inline-flex max-w-40 shrink-0 cursor-help items-center gap-1 text-[11px]"
      >
        <UIcon
          :name="task?.map?.name ? 'i-mdi-map-marker' : 'i-mdi-earth'"
          aria-hidden="true"
          class="h-3 w-3"
        />
        <span class="truncate">
          {{ task?.map?.name || t('page.tasks.questcard.any_map') }}
        </span>
      </UBadge>
    </AppTooltip>
    <UBadge v-if="isFailed" size="xs" color="error" variant="soft" class="shrink-0 text-[11px]">
      {{ t('page.dashboard.stats.failed.stat') }}
    </UBadge>
    <AppTooltip v-if="isInvalid && !isFailed" :text="t('page.tasks.questcard.blocked_tooltip')">
      <UBadge size="xs" color="neutral" variant="soft" class="shrink-0 cursor-help text-[11px]">
        {{ t('page.tasks.questcard.blocked') }}
      </UBadge>
    </AppTooltip>
    <AppTooltip
      v-if="showRequiredLabels && task.kappaRequired"
      :text="t('page.tasks.questcard.kappa_tooltip')"
    >
      <UIcon
        name="i-mdi-trophy"
        class="text-kappa h-4 w-4 shrink-0 cursor-help"
        aria-hidden="true"
      />
    </AppTooltip>
    <AppTooltip
      v-if="showRequiredLabels && task.lightkeeperRequired"
      :text="t('page.tasks.questcard.lightkeeper_tooltip')"
    >
      <UIcon
        name="i-mdi-lighthouse"
        class="text-lightkeeper h-4 w-4 shrink-0 cursor-help"
        aria-hidden="true"
      />
    </AppTooltip>
    <AppTooltip
      v-if="showRequiredLabels && exclusiveEditionBadge"
      :text="
        t(
          'page.tasks.questcard.edition_exclusive_tooltip',
          { editions: exclusiveEditionBadge },
          `This quest is only available to players with ${exclusiveEditionBadge} edition`
        )
      "
    >
      <UBadge size="xs" color="primary" variant="soft" class="shrink-0 cursor-help text-[11px]">
        {{ exclusiveEditionBadge }}
      </UBadge>
    </AppTooltip>
    <slot name="actions" />
    <div class="hidden sm:flex">
      <AppTooltip v-if="isOurFaction" :text="t('page.tasks.questcard.more')">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          class="shrink-0"
          :aria-label="t('page.tasks.questcard.more')"
          @click="emit('openMenu', $event)"
        >
          <UIcon name="i-mdi-dots-horizontal" aria-hidden="true" class="h-5 w-5" />
        </UButton>
      </AppTooltip>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { Task, TraderRequirement, TraderLevelRequirementWithMet } from '@/types/tarkov';
  const props = defineProps<{
    task: Task;
    isPinned: boolean;
    isOurFaction: boolean;
    meetsLevelRequirement: boolean;
    fenceRepRequirement: TraderRequirement | null;
    meetsFenceRepRequirement: boolean;
    traderLevelReqs: TraderLevelRequirementWithMet[];
    locationTooltip: string;
    isFailed: boolean;
    isInvalid: boolean;
    showRequiredLabels: boolean;
    exclusiveEditionBadge?: string;
  }>();
  const emit = defineEmits<{
    togglePin: [];
    openMenu: [event: MouseEvent];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const formattedFenceRep = computed(() => {
    if (!props.fenceRepRequirement) return '';
    return props.fenceRepRequirement.value >= 0
      ? `+${props.fenceRepRequirement.value}`
      : String(props.fenceRepRequirement.value);
  });
</script>
