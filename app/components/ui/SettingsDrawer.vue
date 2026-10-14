<template>
  <aside
    ref="drawerRef"
    tabindex="-1"
    :role="isOverlayMode ? 'dialog' : 'complementary'"
    :aria-modal="isOverlayMode ? 'true' : undefined"
    :aria-labelledby="titleId"
    class="overflow-y-auto backdrop-blur-sm"
    :class="
      isOverlayMode
        ? 'bg-surface-900/96 fixed right-3 bottom-3 left-3 z-40 flex max-h-[72vh] flex-col rounded-[28px] border border-white/10 p-4 shadow-2xl sm:top-24 sm:right-4 sm:bottom-auto sm:left-auto sm:max-h-[calc(100vh-7rem)] sm:w-96'
        : 'bg-surface-800/95 sticky top-6 max-h-[calc(100vh-3rem)] w-full rounded-lg border border-white/10 p-4 shadow-xl'
    "
    @keydown="handleKeydown"
  >
    <div class="mb-3 flex items-center justify-between">
      <h2 :id="titleId" class="light:text-surface-50 text-sm font-semibold text-white">
        {{ title }}
      </h2>
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-mdi-close"
        size="xs"
        :aria-label="t('common.close')"
        @click="handleClose"
      />
    </div>
    <slot />
  </aside>
</template>
<script setup lang="ts">
  import { usePageSettingsDrawer } from '@/composables/usePageSettingsDrawer';
  import type { PageSettingsDrawerKey } from '@/composables/usePageSettingsDrawer';
  const props = withDefaults(
    defineProps<{
      pageKey: PageSettingsDrawerKey;
      title: string;
      mode?: 'overlay' | 'docked';
    }>(),
    { mode: 'overlay' }
  );
  const { t } = useI18n({ useScope: 'global' });
  const { close } = usePageSettingsDrawer(props.pageKey);
  const titleId = useId();
  const drawerRef = ref<HTMLElement | null>(null);
  const isOverlayMode = computed(() => props.mode === 'overlay');
  const { restoreTriggerFocus, trapFocus } = useOverlayFocusTrap({
    containerRef: drawerRef,
    isOverlayMode,
  });
  const handleClose = () => {
    close();
    nextTick(() => {
      restoreTriggerFocus();
    });
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
      return;
    }
    trapFocus(event);
  };
</script>
