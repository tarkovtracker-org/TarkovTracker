<template>
  <output class="flex items-center gap-1.5" :class="colorClass">
    <span class="relative flex h-2 w-2">
      <span
        class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
        :class="pingClass"
      ></span>
      <span class="relative inline-flex h-2 w-2 rounded-full" :class="dotClass"></span>
    </span>
    <span class="text-[11px] font-medium">
      {{ t('settings.keybinds.listening', 'Listening...') }}
    </span>
  </output>
</template>
<script setup lang="ts">
  const props = defineProps<{
    hasError: boolean;
  }>();
  const { t } = useI18n();
  const colorClass = computed(() => (props.hasError ? 'text-error-400' : 'text-primary-300'));
  const pingClass = computed(() => (props.hasError ? 'bg-error-400' : 'bg-primary-400'));
  const dotClass = computed(() => (props.hasError ? 'bg-error-500' : 'bg-primary-500'));
</script>
