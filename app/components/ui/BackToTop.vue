<template>
  <Transition name="fade">
    <button
      v-show="visible"
      class="border-surface-600 bg-surface-800/90 text-surface-300 hover:border-primary-700 hover:bg-surface-700/90 hover:text-primary-400 fixed right-6 bottom-6 z-50 flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium shadow-lg backdrop-blur-sm transition-colors"
      :aria-label="t('common.back_to_top')"
      @click="scrollToTop"
    >
      <UIcon name="i-heroicons-arrow-up-20-solid" class="size-3.5" />
      {{ t('common.back_to_top') }}
    </button>
  </Transition>
</template>
<script setup lang="ts">
  import { useScrollRoot } from '@/composables/useScrollRoot';
  const { t } = useI18n({ useScope: 'global' });
  const { getScrollContainer, usesWindowScroll } = useScrollRoot();
  const visible = ref(false);
  const SCROLL_THRESHOLD = 300;
  let rafId: number | null = null;
  let scrollContainer: HTMLElement | null = null;
  const getScrollTop = () => {
    return usesWindowScroll.value ? window.scrollY : (scrollContainer?.scrollTop ?? window.scrollY);
  };
  const onScroll = () => {
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        visible.value = getScrollTop() > SCROLL_THRESHOLD;
        rafId = null;
      });
    }
  };
  const scrollToTop = () => {
    if (usesWindowScroll.value || !scrollContainer) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  };
  onMounted(() => {
    scrollContainer = getScrollContainer();
    window.addEventListener('scroll', onScroll, { passive: true });
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    }
    onScroll();
  });
  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll);
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', onScroll);
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });
</script>
