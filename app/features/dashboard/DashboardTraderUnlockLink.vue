<template>
  <component
    :is="link.to ? 'router-link' : 'div'"
    :to="link.to"
    class="border-warning-500/20 bg-warning-950/20 hover:border-warning-500/40 group flex items-start gap-2 rounded-md border px-3 py-2 text-xs transition-colors"
    data-testid="trader-unlock-requirement"
  >
    <UIcon
      name="i-mdi-lock-outline"
      class="text-warning-400/80 mt-px h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    />
    <span class="min-w-0">
      <span class="text-warning-300/90 block font-medium">
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
    labelKey: 'page.dashboard.traders.unlock_via_storyline',
    labelParams: { chapter: unlock.chapter.name },
    target: unlock.objective.name,
  });
  // A task requirement without a task means metadata is still loading; show the lock without a link.
  const link = computed(() => {
    const unlock = props.unlock;
    if (unlock.kind === 'story') return storyLink(unlock);
    if (!unlock.task) {
      return { to: undefined, labelKey: 'page.dashboard.traders.unlock_via_task', labelParams: {} };
    }
    return {
      to: { path: '/tasks', query: { task: unlock.task.id } },
      labelKey: 'page.dashboard.traders.unlock_via_task',
      labelParams: {},
      target: unlock.task.name,
    };
  });
</script>
