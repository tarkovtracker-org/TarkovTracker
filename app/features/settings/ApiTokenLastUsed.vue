<template>
  <span>
    {{ t('page.settings.card.apitokens.list.last_used') }}:
    <time v-if="date" :datetime="date">{{ new Date(date).toLocaleString() }}</time>
    <template v-else>{{ t('page.settings.card.apitokens.list.never') }}</template>
  </span>
</template>
<script setup lang="ts">
  defineProps<{ date: string | null }>();
  const { t } = useI18n({ useScope: 'global' });
</script>
