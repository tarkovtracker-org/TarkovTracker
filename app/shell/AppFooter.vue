<template>
  <footer class="bg-surface-900/60 border-surface-800/70 w-full border-t px-6 py-8">
    <div class="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 text-center">
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <router-link
          to="/terms-of-service"
          class="text-info-400 hover:text-info-300 transition-colors"
        >
          {{ t('footer.terms_of_service') }}
        </router-link>
        <span class="text-surface-500">·</span>
        <router-link to="/privacy" class="text-info-400 hover:text-info-300 transition-colors">
          {{ t('footer.privacy_policy') }}
        </router-link>
        <span class="text-surface-500">·</span>
        <router-link to="/credits" class="text-info-400 hover:text-info-300 transition-colors">
          {{ t('footer.credits') }}
        </router-link>
        <template v-if="analyticsConfigured">
          <span class="text-surface-500">·</span>
          <button
            type="button"
            class="text-info-400 hover:text-info-300 transition-colors"
            @click="openAnalyticsPreferences"
          >
            {{ t('footer.analytics_preferences') }}
          </button>
        </template>
      </div>
      <div class="text-surface-500 text-center text-xs">
        <div class="text-surface-400 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>TarkovTracker &copy; 2020–{{ new Date().getFullYear() }}</span>
          <span class="text-surface-500">·</span>
          <span class="text-surface-400 font-mono">v{{ appVersion }}</span>
        </div>
        <p class="text-surface-400 mt-1">{{ t('footer.game_attribution') }}</p>
      </div>
    </div>
  </footer>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  import { shouldEnableAnalyticsIntegrations } from '@/utils/runtimeConfig';
  const { t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const appVersion = runtimeConfig.public.appVersion || 'dev';
  const analyticsConfigured =
    shouldEnableAnalyticsIntegrations({
      appUrl: runtimeConfig.public.appUrl,
      hostname: import.meta.client ? window.location.hostname : undefined,
      isProduction: import.meta.env.PROD,
    }) &&
    [
      runtimeConfig.public.googleAnalyticsMeasurementId,
      runtimeConfig.public.microsoftClarityProjectId,
    ].some((value) => String(value || '').trim().length > 0);
  const analyticsConsentApi = shallowRef<ReturnType<typeof useAnalyticsConsent> | null>(null);
  try {
    const consentApi = useAnalyticsConsent();
    analyticsConsentApi.value = analyticsConfigured ? consentApi : null;
  } catch (error) {
    logger.error('[AppFooter] Failed to initialize analytics consent', error);
    analyticsConsentApi.value = null;
  }
  const openAnalyticsPreferences = () => {
    analyticsConsentApi.value?.openPreferences();
  };
</script>
