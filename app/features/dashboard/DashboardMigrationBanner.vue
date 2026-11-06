<template>
  <div
    v-if="!dismissed"
    class="border-warning-500/35 bg-warning-500/10 light:bg-warning-100 inline-flex items-center rounded-full border text-xs"
    data-testid="dashboard-migration-banner"
  >
    <UButton
      size="xs"
      color="neutral"
      variant="link"
      to="/resources/tarkovtracker_org_vs_io"
      icon="i-mdi-archive-arrow-up"
      class="text-warning-300 light:text-warning-800 hover:text-warning-200 py-1 pr-1 pl-2.5"
      :title="t('page.resources.migration_banner.cta', 'Read the migration guide')"
    >
      {{ t('page.resources.migration_banner.chip', 'From .io?') }}
    </UButton>
    <UButton
      size="xs"
      color="neutral"
      variant="link"
      icon="i-mdi-close"
      class="text-surface-400 hover:text-surface-200 py-1 pr-2 pl-0.5"
      :aria-label="t('common.close', 'Close')"
      @click="dismissed = true"
    />
  </div>
</template>
<script setup lang="ts">
  import { usePreferencesStore } from '@/stores/usePreferences';
  const { t } = useI18n({ useScope: 'global' });
  const preferences = usePreferencesStore();
  const dismissed = computed({
    get: () => preferences.dashboardNoticeDismissed,
    set: (value: boolean) => preferences.setDashboardNoticeDismissed(value),
  });
</script>
