<template>
  <label
    class="mb-1.5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-s-3 px-3 py-2.5 focus-within:ring-2"
    :class="[cardClass, selected && selectedClass, blocked && 'cursor-not-allowed opacity-65']"
  >
    <input
      type="checkbox"
      class="mt-0.5 size-4 shrink-0"
      :class="checkboxClass"
      :checked="selected"
      :aria-label="entry.name"
      :aria-describedby="`${pointsId} ${effectId}`"
      :aria-disabled="blocked || undefined"
      @change="emit('toggle', $event)"
    />
    <span class="min-w-0 flex-1">
      <span class="text-surface-50 block text-sm font-semibold">{{ entry.name }}</span>
      <span :id="effectId" class="text-surface-300 mt-0.5 block text-sm leading-snug wrap-anywhere">
        <template v-for="(part, index) in entry.effect.split(/\*\*(.+?)\*\*/g)" :key="index">
          <strong v-if="index % 2" class="text-surface-50 font-semibold">{{ part }}</strong>
          <template v-else>{{ part }}</template>
        </template>
      </span>
    </span>
    <UBadge
      :id="pointsId"
      :color="positive ? 'success' : 'error'"
      variant="soft"
      class="tabular-nums"
    >
      {{ signedPoints(entry.netCost) }}
    </UBadge>
  </label>
</template>
<script setup lang="ts">
  import type { ModifierDisplay } from '@/features/seasonal-modifiers/planner';
  const props = defineProps<{
    entry: ModifierDisplay;
    positive: boolean;
    selected: boolean;
    blocked: boolean;
  }>();
  const emit = defineEmits<{ toggle: [event: Event] }>();
  const positive = computed(() => props.positive);
  const effectId = useId();
  const pointsId = useId();
  const cardClass = computed(() =>
    positive.value
      ? 'border-success-500/20 border-s-success-500/60 from-success-500/15 to-success-500/5 hover:border-success-400/60 focus-within:ring-success-400/60 bg-linear-to-r'
      : 'border-error-500/20 border-s-error-500/60 from-error-500/15 to-error-500/5 hover:border-error-400/60 focus-within:ring-error-400/60 bg-linear-to-r'
  );
  const selectedClass = computed(() =>
    positive.value ? 'ring-1 ring-success-400/80' : 'ring-1 ring-error-400/80'
  );
  const checkboxClass = computed(() =>
    positive.value ? 'accent-success-500' : 'accent-error-500'
  );
  const signedPoints = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);
</script>
