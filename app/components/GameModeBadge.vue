<template>
  <img
    v-if="isGameMode(mode)"
    :src="`/img/game-modes/${mode}.png`"
    alt=""
    :width="size"
    :height="size"
    class="shrink-0 object-contain"
  />
</template>
<script setup lang="ts">
  import { isGameMode, type GameMode } from '@/utils/constants';
  const { mode, size = 36 } = defineProps<{
    mode: GameMode | 'arena' | 'unknown';
    size?: number;
  }>();
</script>
