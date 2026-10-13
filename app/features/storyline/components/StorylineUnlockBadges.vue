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
      :icon="UNLOCK_ICONS[unlock.type]"
    >
      {{ t(UNLOCK_LABEL_KEYS[unlock.type], { name: unlock.label }) }}
    </UBadge>
    <span
      v-for="note in notes"
      :key="note"
      class="text-surface-400 basis-full text-xs leading-snug wrap-break-word"
    >
      {{ note }}
    </span>
    <UBadge v-if="estimated" variant="subtle" color="neutral" size="md" icon="i-mdi-clock-outline">
      {{ t('page.storyline.route_unlocks_estimated') }}
    </UBadge>
  </span>
</template>
<script setup lang="ts">
  import type { StorylineObjectiveUnlockView } from '@/composables/useStorylineChapters';
  type UnlockType = StorylineObjectiveUnlockView['type'];
  const props = defineProps<{
    unlocks: StorylineObjectiveUnlockView[];
    estimated?: boolean;
    label?: string;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const notes = computed(() =>
    Array.from(
      new Set(
        props.unlocks
          .map((unlock) => unlock.note)
          .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
      )
    )
  );
  const UNLOCK_COLORS: Record<UnlockType, 'primary' | 'warning' | 'success'> = {
    map: 'primary',
    trader: 'warning',
    reward: 'success',
  };
  const UNLOCK_ICONS: Record<UnlockType, string> = {
    map: 'i-mdi-map-outline',
    trader: 'i-mdi-account-tie',
    reward: 'i-mdi-gift-outline',
  };
  const UNLOCK_LABEL_KEYS: Record<UnlockType, string> = {
    map: 'page.storyline.route_unlock_map',
    trader: 'page.storyline.route_unlock_trader',
    reward: 'page.storyline.route_unlock_reward',
  };
</script>
