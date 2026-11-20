<template>
  <img
    v-if="hasBadge"
    :src="`/img/game-modes/${mode}.png`"
    alt=""
    :width="size"
    :height="size"
    class="shrink-0 object-contain"
  />
</template>
<script setup lang="ts">
  import { GAME_MODE_VALUES } from '@/utils/constants';
  const { mode, size = 36 } = defineProps<{ mode: string; size?: number }>();
  const hasBadge = computed(() => GAME_MODE_VALUES.some((value) => value === mode));
</script>
