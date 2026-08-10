<template>
  <div v-if="!dismissed" class="mb-3" data-testid="dashboard-migration-banner">
    <div class="panel px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
          <UIcon name="i-mdi-archive-arrow-up" class="text-warning-400 h-4 w-4 shrink-0" />
          <span class="truncate">
            {{ t('page.resources.migration_banner.title', 'Moving from TarkovTracker.io?') }}
          </span>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <UButton
            size="xs"
            color="primary"
            variant="solid"
            to="/resources/tarkovtracker_org_vs_io"
            trailing-icon="i-mdi-arrow-right"
          >
            {{ t('page.resources.migration_banner.cta', 'Read the migration guide') }}
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-mdi-close"
            :aria-label="t('common.close', 'Close')"
            @click="dismissed = true"
          />
        </div>
      </div>
    </div>
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
