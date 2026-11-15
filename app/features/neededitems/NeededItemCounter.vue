<template>
  <span
    v-if="state === 'teammates'"
    class="text-surface-400 inline-flex items-center gap-1 text-xs"
    :title="hiddenForSelfHint"
  >
    <UIcon name="i-mdi-account-group" class="size-4" aria-hidden="true" />
    {{ $t('needed_items.for_teammates') }}
  </span>
  <span
    v-else-if="state === 'done'"
    class="text-success-300 inline-flex items-center gap-1 text-sm font-semibold tabular-nums"
  >
    <UIcon name="i-mdi-check-circle" class="size-4" aria-hidden="true" />
    {{ formatNumber(currentCount) }}/{{ formatNumber(neededCount) }}
  </span>
  <NeededItemCollectButton
    v-else-if="state === 'single'"
    :collected="currentCount >= neededCount"
    :wide="wide"
    :disabled="disabled"
    @toggle="$emit('toggle')"
  />
  <ItemCountControls
    v-else
    :size="wide ? 'tile' : 'md'"
    :current-count="currentCount"
    :needed-count="neededCount"
    :disabled="disabled"
    :decrease-label="decreaseLabel"
    :increase-label="increaseLabel"
    @decrease="$emit('decrease')"
    @increase="$emit('increase')"
    @toggle="$emit('toggle')"
    @set-count="(count) => $emit('setCount', count)"
  />
</template>
<script setup lang="ts">
  import ItemCountControls from '@/features/neededitems/ItemCountControls.vue';
  import NeededItemCollectButton from '@/features/neededitems/NeededItemCollectButton.vue';
  import { useLocaleNumberFormatter } from '@/utils/formatters';
  /**
   * The one tracking control used by every Needed Items layout: a collect toggle for single
   * items, a stepper for counted items, and read-only states for finished or teammate needs.
   */
  const props = withDefaults(
    defineProps<{
      currentCount: number;
      neededCount: number;
      /** The parent quest is turned in or the module is built. */
      done?: boolean;
      /** The user hid the task; the need is listed for teammates only. */
      hiddenForSelf?: boolean;
      hiddenForSelfHint?: string;
      /** Stretch the single-item toggle to the full width (grid tiles). */
      wide?: boolean;
      disabled?: boolean;
      decreaseLabel?: string;
      increaseLabel?: string;
    }>(),
    {
      done: false,
      hiddenForSelf: false,
      hiddenForSelfHint: '',
      wide: false,
      disabled: false,
      decreaseLabel: undefined,
      increaseLabel: undefined,
    }
  );
  defineEmits<{
    decrease: [];
    increase: [];
    toggle: [];
    setCount: [count: number];
  }>();
  const formatNumber = useLocaleNumberFormatter();
  const state = computed(() => {
    if (props.hiddenForSelf) return 'teammates';
    if (props.done) return 'done';
    return props.neededCount === 1 ? 'single' : 'counted';
  });
</script>
