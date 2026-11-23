<template>
  <span
    class="relative flex shrink-0 items-center justify-center"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <UIcon
      v-if="loading"
      name="i-heroicons-arrow-path"
      class="text-surface-500 size-4 animate-spin"
      aria-hidden="true"
    />
    <NuxtImg
      v-else-if="src && !loadFailed"
      :src="src"
      alt=""
      :width="size"
      :height="size"
      class="size-full object-contain"
      @error="handleError"
    />
    <UIcon v-else :name="fallbackIcon" class="text-surface-500 size-3/5" aria-hidden="true" />
  </span>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  /** Decorative sidebar image with a spinner while metadata loads and an icon if it fails. */
  const {
    fallbackIcon,
    loading = false,
    size,
    src,
  } = defineProps<{
    fallbackIcon: string;
    loading?: boolean;
    size: number;
    src: string;
  }>();
  const loadFailed = ref<boolean>(false);
  watch(
    () => src,
    () => {
      loadFailed.value = false;
    }
  );
  function handleError(event: string | Event): void {
    const failedSrc =
      typeof event === 'string' ? event : (event.target as HTMLImageElement | null)?.src;
    logger.warn('Failed to load sidebar emblem', { src: failedSrc });
    loadFailed.value = true;
  }
</script>
