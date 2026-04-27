<template>
  <SettingsPage />
</template>
<script setup lang="ts">
  import SettingsPage from '@/pages/settings.vue';
  definePageMeta({
    middleware: ['auth'],
  });
</script>
