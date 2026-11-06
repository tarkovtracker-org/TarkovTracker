<template>
  <UPopover :content="{ align, sideOffset: 6 }">
    <UButton
      :data-testid="`${testIdPrefix}-button`"
      variant="ghost"
      color="neutral"
      size="sm"
      icon="i-mdi-filter-variant"
      class="border leading-none"
      :class="
        activeCount > 0
          ? 'border-primary-500/45 bg-primary-500/12 light:text-primary-700 text-white'
          : 'text-surface-200 border-white/10'
      "
      :aria-label="buttonAriaLabel"
    >
      <span class="hidden text-xs leading-none uppercase sm:inline">
        {{ t('filter_menu.button') }}
      </span>
      <span
        v-if="activeCount > 0"
        :data-testid="`${testIdPrefix}-count`"
        class="bg-primary-500 text-surface-950 light:text-surface-50 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
      >
        {{ activeCount }}
      </span>
    </UButton>
    <template #content>
      <div
        :data-testid="`${testIdPrefix}-panel`"
        class="max-h-[min(36rem,calc(100vh-8rem))] w-80 max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 class="light:text-surface-50 text-sm font-semibold text-white">{{ title }}</h2>
          <UButton
            :data-testid="`${testIdPrefix}-reset`"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-mdi-filter-remove-outline"
            :disabled="!isResetEnabled"
            @click="emit('reset')"
          >
            {{ t('common.reset') }}
          </UButton>
        </div>
        <slot />
      </div>
    </template>
  </UPopover>
</template>
<script setup lang="ts">
  const props = withDefaults(
    defineProps<{
      title: string;
      activeCount: number;
      /** Prefix for the button, count, panel, and reset test ids. */
      testIdPrefix: string;
      /** Which button edge the panel lines up with; match the side the button sits on. */
      align?: 'start' | 'end';
      /** Reset can clear saved filters idle in this view; defaults to having an active filter. */
      canReset?: boolean;
    }>(),
    { align: 'end', canReset: undefined }
  );
  const emit = defineEmits<{ reset: [] }>();
  const { t } = useI18n({ useScope: 'global' });
  const isResetEnabled = computed(() => props.canReset ?? props.activeCount > 0);
  const buttonAriaLabel = computed(() =>
    props.activeCount > 0
      ? t('filter_menu.button_active', { count: props.activeCount })
      : t('filter_menu.button')
  );
</script>
