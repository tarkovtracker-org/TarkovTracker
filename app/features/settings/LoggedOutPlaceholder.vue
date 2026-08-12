<template>
  <UAlert color="warning" variant="soft" icon="i-mdi-lock" :title="title">
    <template #description>
      <NuxtLink
        to="/login"
        class="text-warning-300 hover:text-warning-200 underline transition-colors"
      >
        {{ $t('navigation_drawer.login', 'Log In') }}
      </NuxtLink>
    </template>
  </UAlert>
</template>
<script setup lang="ts">
  defineProps<{
    title: string;
  }>();
</script>
