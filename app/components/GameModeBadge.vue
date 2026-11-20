<template>
  <img
    :src="`/img/game-modes/${mode}.png`"
    alt=""
    :width="size"
    :height="size"
    class="shrink-0 object-contain"
  />
</template>
<script setup lang="ts">
  import type { GameMode } from '@/utils/constants';
  withDefaults(defineProps<{ mode: GameMode; size?: number }>(), { size: 36 });
</script>
