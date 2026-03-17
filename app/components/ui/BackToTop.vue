<template>
  <Transition name="fade">
    <button
      v-show="visible"
      class="border-border bg-panel/90 text-foreground-muted shadow-card hover:border-border-strong hover:bg-raised/95 hover:text-foreground fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium backdrop-blur-sm transition-colors"
      :aria-label="t('common.back_to_top')"
      @click="scrollToTop"
    >
      <UIcon name="i-heroicons-arrow-up-20-solid" class="size-3.5" />
      {{ t('common.back_to_top') }}
    </button>
  </Transition>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  const visible = ref(false);
  const SCROLL_THRESHOLD = 300;
  const onScroll = () => {
    visible.value = window.scrollY > SCROLL_THRESHOLD;
  };
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  });
  onUnmounted(() => {
    window.removeEventListener('scroll', onScroll);
  });
</script>
