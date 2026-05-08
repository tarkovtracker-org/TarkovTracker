<template>
  <StreamerToolsPanel />
</template>
<script setup lang="ts">
  import StreamerToolsPanel from '@/features/streamer-tools/StreamerToolsPanel.vue';
  useSeoMeta({
    description:
      'Generate browser-source overlays for stream software to display Tarkov Kappa progress.',
    title: 'Streamer Tools',
  });
</script>
