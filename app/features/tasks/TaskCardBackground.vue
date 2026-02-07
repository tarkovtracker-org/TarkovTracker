<template>
  <div
    v-if="isComplete && !isFailed"
    class="bg-completed-600/30 pointer-events-none absolute inset-0 z-0"
  />
  <div
    v-if="showIcon"
    class="pointer-events-none absolute inset-0 z-0 flex rotate-12 transform items-center justify-center p-8"
    :class="[iconColor, iconOpacity]"
  >
    <UIcon :name="iconName" aria-hidden="true" class="h-24 w-24" />
  </div>
</template>
<script setup lang="ts">
  const props = defineProps<{
    isComplete: boolean;
    isFailed: boolean;
    isLocked: boolean;
    isInvalid: boolean;
  }>();
  const showIcon = computed(
    () => props.isLocked || props.isFailed || props.isComplete || props.isInvalid
  );
  const icon = computed(() => {
    if (props.isFailed) return 'mdi-close-octagon';
    if (props.isComplete) return 'mdi-check';
    if (props.isInvalid) return 'mdi-cancel';
    if (props.isLocked) return 'mdi-lock';
    return '';
  });
  const iconName = computed(() => {
    const base = icon.value;
    return base.startsWith('mdi-') ? `i-${base}` : base;
  });
  const iconColor = computed(() => {
    if (props.isFailed) return 'text-error-400';
    if (props.isComplete) return 'text-completed-400';
    if (props.isInvalid) return 'text-surface-400';
    if (props.isLocked) return 'text-locked-500';
    return 'text-brand-200';
  });
  const iconOpacity = computed(() => {
    if (props.isComplete && !props.isFailed) return 'opacity-[0.12]';
    if (props.isLocked) return 'opacity-20';
    return 'opacity-15';
  });
</script>
