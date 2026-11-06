<template>
  <AppTooltip :text="props.hiddenForSelf ? (props.hint ?? '') : ''">
    <span
      class="rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ring-1"
      :class="status.classes"
    >
      {{ $t(status.key) }}
      <span v-if="props.hiddenForSelf && props.hint" class="sr-only">{{ props.hint }}</span>
    </span>
  </AppTooltip>
</template>
<script setup lang="ts">
  const props = defineProps<{
    handedOver: boolean;
    collected: boolean;
    hiddenForSelf?: boolean;
    hint?: string;
  }>();
  const status = computed(() => {
    if (props.hiddenForSelf) {
      return {
        key: 'needed_items.hidden_for_you',
        classes: 'bg-surface-700/80 text-surface-300 ring-white/5',
      };
    }
    if (props.handedOver) {
      return {
        key: 'needed_items.handed_over',
        classes: 'bg-success-500/25 text-success-300 ring-success-500/20',
      };
    }
    if (props.collected) {
      return {
        key: 'common.ready_to_hand_over',
        classes: 'bg-info-500/25 text-info-300 ring-info-500/20',
      };
    }
    return {
      key: 'needed_items.not_collected',
      classes: 'bg-surface-700/80 text-surface-300 ring-white/5',
    };
  });
</script>
