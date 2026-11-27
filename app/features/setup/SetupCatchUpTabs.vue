<template>
  <div
    class="bg-surface-950/60 flex flex-wrap gap-1.5 rounded-lg border border-white/8 p-1.5"
    role="tablist"
  >
    <UButton
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      role="tab"
      size="sm"
      :icon="tab.icon"
      :aria-selected="tab.active"
      :color="tab.color"
      :variant="tab.variant"
      @click="emit('select', tab.id)"
    >
      <span>{{ tab.label }}</span>
      <UBadge v-if="tab.count > 0" size="xs" :color="tab.badgeColor" variant="subtle">
        {{ tab.count }}
      </UBadge>
    </UButton>
  </div>
</template>
<script setup lang="ts">
  type CatchUpTabId = 'quests' | 'traders' | 'hideout';
  type TabItem = {
    id: CatchUpTabId;
    label: string;
    icon: string;
    count: number;
    active: boolean;
    color: 'primary' | 'neutral';
    variant: 'solid' | 'ghost';
    badgeColor: 'neutral' | 'primary';
  };
  defineProps<{ tabs: readonly TabItem[] }>();
  const emit = defineEmits<{ select: [id: CatchUpTabId] }>();
</script>
