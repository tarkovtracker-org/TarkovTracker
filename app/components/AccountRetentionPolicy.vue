<script setup lang="ts">
  const { t } = useI18n({ useScope: 'global' });
</script>
<template>
  <div class="space-y-4 text-sm leading-relaxed">
    <p>{{ t('page.account_retention.scope') }}</p>
    <ul class="ml-6 list-disc space-y-2">
      <li>{{ t('page.account_retention.standard') }}</li>
      <li>{{ t('page.account_retention.previous_supporter') }}</li>
      <li>{{ t('page.account_retention.active_subscriber') }}</li>
    </ul>
    <p>{{ t('page.account_retention.subscription_end') }}</p>
    <p>{{ t('page.account_retention.activity') }}</p>
    <p>{{ t('page.account_retention.exceptions') }}</p>
    <p>{{ t('page.account_retention.no_guarantee') }}</p>
    <p>{{ t('page.account_retention.backup') }}</p>
    <p>{{ t('page.account_retention.rights') }}</p>
  </div>
</template>
