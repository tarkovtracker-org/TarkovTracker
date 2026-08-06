<template>
  <div v-if="!dismissed" class="mb-3" data-testid="dashboard-migrate-banner">
    <div class="panel px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
          <UIcon name="i-mdi-archive-arrow-up" class="text-warning-400 h-4 w-4 shrink-0" />
          <span class="truncate">{{ t('page.migrate.banner_title') }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <UButton
            size="xs"
            color="primary"
            variant="solid"
            to="/migrate"
            trailing-icon="i-mdi-arrow-right"
          >
            {{ t('page.migrate.banner_cta') }}
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="'i-mdi-close'"
            :aria-label="t('common.close')"
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
  const dismissed = ref(preferences.dashboardNoticeDismissed);
  watch(dismissed, (value) => {
    preferences.setDashboardNoticeDismissed(value);
  });
</script>
