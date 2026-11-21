<template>
  <div
    role="group"
    :aria-label="t('page.seasonal_modifiers.title')"
    class="grid grid-cols-2 gap-2 sm:hidden"
  >
    <UButton
      v-for="side in sides"
      :key="side"
      class="justify-center"
      color="neutral"
      :variant="mobileSide === side ? 'soft' : 'outline'"
      :aria-pressed="mobileSide === side"
      :label="t(`page.seasonal_modifiers.${side}_short`)"
      @click="mobileSide = side"
    />
  </div>
  <div class="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
    <ModifierBoard
      v-for="side in sides"
      :key="side"
      :class="mobileSide === side ? '' : 'hidden sm:flex'"
      :side="side"
      :items="visible[side]"
      :selected="selected"
      :order="order"
      :floor="floor"
      @toggle="(entry, event) => emit('toggle', entry, event)"
    />
  </div>
</template>
<script setup lang="ts">
  import ModifierBoard from '@/features/seasonal-modifiers/ModifierBoard.vue';
  import type { ModifierDisplay, ModifierOrder } from '@/features/seasonal-modifiers/planner';
  const sides = ['drawbacks', 'perks'] as const;
  const mobileSide = ref<(typeof sides)[number]>('drawbacks');
  defineProps<{
    visible: Record<(typeof sides)[number], ModifierDisplay[]>;
    selected: ReadonlySet<string>;
    order: ModifierOrder;
    floor: number;
  }>();
  const emit = defineEmits<{ toggle: [entry: ModifierDisplay, event: Event] }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
