<template>
  <div
    role="group"
    :aria-label="itemLabel"
    class="border-surface-700 flex flex-wrap items-center justify-between gap-2 border-b py-1.5"
  >
    <span class="min-w-20 flex-1 text-sm">
      {{ itemLabel }}
      <span v-if="showFoundInRaidBadge" class="text-warning-400 block text-xs">
        {{ $t('common.fir') }}
      </span>
    </span>
    <UButton
      v-if="isCurrency || requiredCount === 1"
      :aria-pressed="isComplete"
      :aria-label="$t('page.hideout.map.toggle_item', { name: itemLabel })"
      color="neutral"
      variant="soft"
      :icon="isComplete ? 'i-mdi-checkbox-marked' : 'i-mdi-checkbox-blank-outline'"
      @click="emit('toggle')"
    >
      <span v-if="!isCurrency">{{ currentCount }}/{{ requiredCount }}</span>
    </UButton>
    <ItemCountControls
      v-else
      size="sm"
      :count-label="$t('page.hideout.map.edit_count', { name: itemLabel })"
      :decrease-label="$t('needed_items.inline_counts.decrease', { name: itemLabel })"
      :increase-label="$t('needed_items.inline_counts.increase', { name: itemLabel })"
      :current-count="currentCount"
      :needed-count="requiredCount"
      @decrease="emit('count', currentCount - 1)"
      @increase="emit('count', currentCount + 1)"
      @toggle="emit('toggle')"
      @set-count="emit('count', $event)"
    />
  </div>
</template>
<script setup lang="ts">
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  defineProps<{
    itemLabel?: string;
    currentCount: number;
    requiredCount: number;
    isCurrency: boolean;
    isComplete: boolean;
    showFoundInRaidBadge: boolean;
  }>();
  const emit = defineEmits<{ count: [value: number]; toggle: [] }>();
</script>
