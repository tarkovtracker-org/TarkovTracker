<template>
  <div class="bg-surface-850 relative mt-2 rounded-lg shadow-md">
    <div
      class="absolute -top-4 left-4 flex h-16 w-16 items-center justify-center rounded-full shadow-md"
      :class="`bg-${props.iconBackground}`"
    >
      <UIcon
        :name="props.icon.startsWith('mdi-') ? `i-${props.icon}` : props.icon"
        class="h-8 w-8"
        :class="`text-${props.iconColor}`"
      />
    </div>
    <div class="flex min-h-12 items-center p-2 pb-0 pl-24 text-left text-xl font-medium">
      <slot name="stat"></slot>
    </div>
    <div class="p-2 pt-6 text-center">
      <slot name="content"></slot>
    </div>
  </div>
</template>
<script setup lang="ts">
  import type { SemanticColor } from '@/types/theme';
  interface IconCardProps {
    icon?: string;
    iconBackground?: SemanticColor;
    iconColor?: SemanticColor;
  }
  const props = withDefaults(defineProps<IconCardProps>(), {
    icon: 'mdi-check-all',
    iconBackground: 'accent',
    iconColor: 'secondary',
  });
</script>
