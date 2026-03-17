<template>
  <div class="flex h-52 items-center justify-center text-center">
    <UCard
      class="bg-panel text-foreground border-border w-full max-w-xl border"
      :ui="{ body: 'p-6' }"
    >
      {{ $t('page.not_found.not_found_description') }}
    </UCard>
  </div>
</template>
<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({
    layout: 'default',
  });
  useHead(() => ({
    title: t('page.not_found.title'),
    meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  }));
</script>
