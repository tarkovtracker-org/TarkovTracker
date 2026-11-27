<template>
  <span
    v-if="iconPath"
    aria-hidden="true"
    class="inline-block shrink-0 bg-current mask-contain mask-center mask-no-repeat"
    :style="{ width: `${size}px`, height: `${size}px`, maskImage: `url(${iconPath})` }"
  />
</template>
<script setup lang="ts">
  import { getFactionIconPath } from '@/utils/factionIcons';
  const props = withDefaults(
    defineProps<{
      faction: string | null | undefined;
      size?: number;
    }>(),
    { size: 20 }
  );
  const iconPath = computed(() => getFactionIconPath(props.faction));
</script>
