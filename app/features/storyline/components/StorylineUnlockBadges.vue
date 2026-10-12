<template>
  <span class="flex flex-wrap items-center gap-1">
    <span v-if="label" class="text-surface-500 text-xs font-medium tracking-wide uppercase">
      {{ label }}:
    </span>
    <UBadge
      v-for="unlock in unlocks"
      :key="`${unlock.type}-${unlock.id}`"
      variant="subtle"
      size="md"
      :color="UNLOCK_COLORS[unlock.type]"
    >
      {{ t(UNLOCK_LABEL_KEYS[unlock.type], { name: unlock.label }) }}
    </UBadge>
    <UBadge v-if="estimated" variant="subtle" color="neutral" size="md">
      {{ t('page.storyline.route_unlocks_estimated') }}
    </UBadge>
  </span>
</template>
<script setup lang="ts">
  import type { StorylineObjectiveUnlockView } from '@/composables/useStorylineChapters';
  type UnlockType = StorylineObjectiveUnlockView['type'];
  defineProps<{
    unlocks: StorylineObjectiveUnlockView[];
    estimated?: boolean;
    label?: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const UNLOCK_COLORS: Record<UnlockType, 'primary' | 'warning' | 'success'> = {
    map: 'primary',
    trader: 'warning',
    reward: 'success',
  };
  const UNLOCK_LABEL_KEYS: Record<UnlockType, string> = {
    map: 'page.storyline.route_unlock_map',
    trader: 'page.storyline.route_unlock_trader',
    reward: 'page.storyline.route_unlock_reward',
  };
</script>
