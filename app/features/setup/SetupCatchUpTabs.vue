<template>
  <div
    class="bg-surface-950/60 flex flex-wrap gap-1.5 rounded-lg border border-white/8 p-1.5"
    role="tablist"
    :aria-label="$t('setup.steps.catch_up')"
  >
    <UButton
      v-for="(tab, index) in tabs"
      :id="`${idPrefix}-tab-${tab.id}`"
      :key="tab.id"
      type="button"
      role="tab"
      size="sm"
      :icon="tab.icon"
      :aria-selected="tab.active"
      :aria-controls="`${idPrefix}-panel-${tab.id}`"
      :tabindex="tab.active ? 0 : -1"
      :color="tab.color"
      :variant="tab.variant"
      @click="emit('select', tab.id)"
      @keydown="selectWithKeyboard($event, index)"
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
  const props = defineProps<{ tabs: readonly TabItem[]; idPrefix: string }>();
  const emit = defineEmits<{ select: [id: CatchUpTabId] }>();
  function selectWithKeyboard(event: KeyboardEvent, index: number) {
    const count = props.tabs.length;
    const destinations: Partial<Record<string, number>> = {
      ArrowLeft: (index + count - 1) % count,
      ArrowRight: (index + 1) % count,
      Home: 0,
      End: count - 1,
    };
    const destination = destinations[event.key];
    const tab = destination === undefined ? undefined : props.tabs[destination];
    if (!tab) return;
    event.preventDefault();
    emit('select', tab.id);
    document.getElementById(`${props.idPrefix}-tab-${tab.id}`)?.focus();
  }
</script>
