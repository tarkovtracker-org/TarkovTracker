<template>
  <button
    type="button"
    class="focus-visible:ring-primary-400 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
    :class="[
      wide ? 'w-full px-3' : 'w-8',
      collected
        ? 'bg-success-600 border-success-500 hover:bg-success-700 text-white'
        : 'bg-surface-700 text-surface-200 hover:bg-surface-600 light:hover:text-surface-50 border-white/15 hover:text-white',
    ]"
    :title="label"
    :aria-label="label"
    :aria-pressed="collected"
    :disabled="disabled"
    @click="$emit('toggle')"
  >
    <UIcon
      :name="collected ? 'i-mdi-check-circle' : 'i-mdi-check-circle-outline'"
      class="size-5 shrink-0"
      :class="collected ? '' : 'opacity-70'"
      aria-hidden="true"
    />
    <span v-if="wide">{{ shortLabel }}</span>
  </button>
</template>
<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      collected: boolean;
      /** Full-width button with a visible label, used in grid tiles. */
      wide?: boolean;
      disabled?: boolean;
    }>(),
    { wide: false, disabled: false }
  );
  defineEmits<{ toggle: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const label = computed(() =>
    props.collected ? t('needed_items.collected') : t('needed_items.mark_collected')
  );
  /** Visible text in narrow tiles; the accessible name stays the full action. */
  const shortLabel = computed(() =>
    props.collected ? t('needed_items.collected') : t('needed_items.collect')
  );
</script>
