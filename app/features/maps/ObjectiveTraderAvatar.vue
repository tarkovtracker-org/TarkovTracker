<template>
  <span
    class="bg-surface-900 flex shrink-0 items-center justify-center overflow-hidden rounded-full shadow-md ring-1 ring-white/20"
    :class="large ? 'size-10' : 'size-7'"
  >
    <img
      v-if="image"
      data-testid="objective-trader-image"
      :src="image"
      :alt="alt"
      :width="pixels"
      :height="pixels"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
    />
    <UIcon v-else name="i-mdi-account-circle" class="text-surface-400 size-full" />
  </span>
</template>
<script setup lang="ts">
  /**
   * The task giver's portrait in map popups (#1394); a generic avatar when there is no image.
   * The alt text is empty where the trader's name is already shown as text beside it.
   */
  const props = defineProps<{ alt: string; image: string; large?: boolean }>();
  const pixels = computed(() => (props.large ? 40 : 28));
</script>
