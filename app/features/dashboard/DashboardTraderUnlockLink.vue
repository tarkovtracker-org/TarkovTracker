<template>
  <component
    :is="link.to ? 'router-link' : 'div'"
    :to="link.to"
    class="bg-surface-900 border-surface-700/70 group flex min-h-12 w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-start"
    :class="{
      'hover:bg-surface-800 focus-visible:ring-primary-500 focus:outline-hidden focus-visible:ring-2':
        link.to,
    }"
    data-testid="trader-unlock-requirement"
  >
    <NuxtImg
      v-if="trader.imageLink"
      :src="trader.imageLink"
      alt=""
      width="28"
      height="28"
      sizes="28px"
      class="bg-surface-800 size-7 shrink-0 rounded-full object-cover grayscale"
    />
    <UIcon
      v-else
      name="i-mdi-account"
      class="text-surface-400 size-7 shrink-0"
      aria-hidden="true"
    />
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="flex items-start justify-between gap-2">
        <span class="min-w-0 text-sm font-semibold wrap-anywhere">{{ trader.name }}</span>
        <span
          class="text-warning-300 light:text-warning-800 flex shrink-0 items-center gap-1 text-xs"
        >
          <UIcon name="i-mdi-lock" class="size-3 shrink-0" aria-hidden="true" />
          {{ $t('common.locked') }}
        </span>
      </span>
      <span class="text-surface-300 text-xs wrap-anywhere" data-testid="trader-unlock-message">
        {{ $t(link.labelKey, link.labelParams) }}
        <span
          v-if="link.target"
          class="text-info-400 light:text-info-800 block group-hover:underline"
        >
          {{ link.target }}
        </span>
      </span>
    </span>
  </component>
</template>
<script setup lang="ts">
  import type { TraderUnlockRequirement } from '@/features/dashboard/traderLockStatus';
  import type { Trader } from '@/types/tarkov';
  const props = defineProps<{ trader: Trader; unlock: TraderUnlockRequirement }>();
  const storyLink = (unlock: Extract<TraderUnlockRequirement, { kind: 'story' }>) => ({
    to: {
      path: '/storyline',
      query: { chapter: unlock.chapter.id, objective: unlock.objective.id },
    },
    labelKey: 'page.dashboard.traders.unlock_via_storyline',
    labelParams: { chapter: unlock.chapter.name },
    target: unlock.objective.name,
  });
  const link = computed(() => {
    const unlock = props.unlock;
    if (unlock.kind === 'story') return storyLink(unlock);
    if (unlock.kind === 'task') {
      return {
        to: { path: '/tasks', query: { task: unlock.task.id } },
        labelKey: 'page.dashboard.traders.unlock_via_task',
        labelParams: {},
        target: unlock.task.name,
      };
    }
    return {
      to: undefined,
      labelKey:
        unlock.kind === 'pending'
          ? 'page.dashboard.traders.unlock_unavailable'
          : 'page.dashboard.traders.unlock_unconfirmed',
      labelParams: {},
    };
  });
</script>
