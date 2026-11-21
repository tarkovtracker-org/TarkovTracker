<template>
  <div :id="id" :hidden="!open">
    <ApiTokenActivity v-if="open" :title="title" :token-id="tokenId" />
  </div>
</template>
<script setup lang="ts">
  import ApiTokenActivity from '@/features/settings/ApiTokenActivity.vue';
  defineProps<{ id: string; open: boolean; title: string; tokenId?: string }>();
</script>
