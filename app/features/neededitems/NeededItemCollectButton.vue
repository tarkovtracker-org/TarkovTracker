<template>
  <AppTooltip :text="label">
    <button
      type="button"
      class="flex items-center justify-center rounded-lg border transition-colors"
      :class="[
        size === 'md' ? 'h-10 w-10' : 'h-8 w-8',
        collected
          ? 'bg-success-600 border-success-500 hover:bg-success-700 text-white'
          : 'bg-surface-700 text-surface-200 hover:bg-surface-600 light:hover:text-surface-50 border-white/20 hover:text-white',
      ]"
      :aria-label="label"
      :aria-pressed="collected"
      @click="$emit('toggle')"
    >
      <UIcon
        :name="collected ? 'i-mdi-check-circle' : 'i-mdi-check-circle-outline'"
        :class="['h-6 w-6', collected ? 'opacity-100' : 'opacity-60']"
      />
    </button>
  </AppTooltip>
</template>
<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      collected: boolean;
      size?: 'sm' | 'md';
    }>(),
    { size: 'sm' }
  );
  defineEmits<{ toggle: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const label = computed(() =>
    props.collected ? t('needed_items.collected') : t('needed_items.mark_collected')
  );
</script>
