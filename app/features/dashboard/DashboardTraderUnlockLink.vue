<template>
  <component
    :is="link.to ? 'router-link' : 'div'"
    :to="link.to"
    class="group flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
    :class="[
      unlock.kind === 'pending'
        ? 'border-surface-700 bg-surface-800/60 text-surface-300'
        : 'border-warning-500/20 bg-warning-950/20 text-warning-300/90',
      { 'hover:border-warning-500/40 transition-colors': link.to },
    ]"
    data-testid="trader-unlock-requirement"
  >
    <UIcon :name="link.icon" class="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span class="min-w-0">
      <span class="block font-medium">
        {{ $t(link.labelKey, link.labelParams) }}
      </span>
      <span
        v-if="link.target"
        class="text-info-400 group-hover:text-info-300 block group-hover:underline"
      >
        {{ link.target }}
      </span>
    </span>
  </component>
</template>
<script setup lang="ts">
  import type { TraderUnlockRequirement } from '@/features/dashboard/traderLockStatus';
  const props = defineProps<{ unlock: TraderUnlockRequirement }>();
  const storyLink = (unlock: Extract<TraderUnlockRequirement, { kind: 'story' }>) => ({
    to: {
      path: '/storyline',
      query: { chapter: unlock.chapter.id, objective: unlock.objective.id },
    },
    icon: 'i-mdi-lock-outline',
    labelKey: 'page.dashboard.traders.unlock_via_storyline',
    labelParams: { chapter: unlock.chapter.name },
    target: unlock.objective.name,
  });
  const unavailableNotice = {
    icon: 'i-mdi-information-outline',
    labelKey: 'page.dashboard.traders.unlock_unavailable',
  };
  const unknownNotice = {
    icon: 'i-mdi-alert-outline',
    labelKey: 'page.dashboard.traders.unlock_unconfirmed',
  };
  const link = computed(() => {
    const unlock = props.unlock;
    if (unlock.kind === 'story') return storyLink(unlock);
    if (unlock.kind === 'task') {
      return {
        to: { path: '/tasks', query: { task: unlock.task.id } },
        icon: 'i-mdi-lock-outline',
        labelKey: 'page.dashboard.traders.unlock_via_task',
        labelParams: {},
        target: unlock.task.name,
      };
    }
    return {
      to: undefined,
      ...(unlock.kind === 'pending' ? unavailableNotice : unknownNotice),
      labelParams: {},
    };
  });
</script>
