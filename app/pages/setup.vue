<template>
  <SetupFlow :key="owner" />
</template>
<script setup lang="ts">
  import SetupFlow from '@/features/setup/SetupFlow.vue';
  const { $supabase } = useNuxtApp();
  const owner = computed(() => $supabase.user.id ?? 'guest');
</script>
