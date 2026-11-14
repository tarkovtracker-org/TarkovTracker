<template>
  <template v-if="color">
    <UButton
      v-if="hasOverride"
      data-testid="map-raid-plan-row-color-reset"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-mdi-restore"
      class="shrink-0"
      :aria-label="t('page.tasks.map.raid_plan.reset_quest_color_named', { name: taskName })"
      @click="emit('reset')"
    />
    <label
      class="focus-within:ring-primary-500 relative size-5 shrink-0 cursor-pointer rounded-full border border-white/40 focus-within:ring-2"
      :style="{ backgroundColor: color }"
    >
      <input
        data-testid="map-raid-plan-row-color"
        type="color"
        class="absolute inset-0 size-full cursor-pointer opacity-0"
        :value="color"
        :aria-label="t('page.tasks.map.raid_plan.quest_color_named', { name: taskName })"
        @change="onChange"
      />
    </label>
  </template>
</template>
<script setup lang="ts">
  import type { Task } from '@/types/tarkov';
  /**
   * A quest's chip color swatch in the Choose quests list (#920). It saves on `change`, once the
   * user commits a color, so dragging through the picker does not redraw the map on every step.
   */
  /** Renders nothing without a color, i.e. outside the quest color mode. */
  defineProps<{ taskName: Task['name']; color: string | undefined; hasOverride: boolean }>();
  const emit = defineEmits<{ change: [color: string]; reset: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const onChange = (event: Event) => {
    const input = event.target as HTMLInputElement | null;
    if (input) emit('change', input.value);
  };
</script>
