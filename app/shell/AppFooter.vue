<template>
  <footer class="border-border bg-shell/80 w-full border-t px-6 py-8 backdrop-blur-sm">
    <div class="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 text-center">
      <a
        href="https://ko-fi.com/dysektai"
        target="_blank"
        rel="noopener noreferrer"
        class="border-success-500 bg-success-600 shadow-card hover:border-success-400 hover:bg-success-500 inline-flex items-center gap-2 rounded-lg border px-6 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
      >
        <UIcon name="i-mdi-heart" class="text-error-300 h-4 w-4" />
        <span>{{ t('footer.support_button') }}</span>
      </a>
      <p class="text-foreground-muted text-xs italic">{{ t('footer.support_tagline') }}</p>
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
        <router-link
          to="/terms-of-service"
          class="text-info-400 hover:text-info-300 transition-colors"
        >
          {{ t('footer.terms_of_service') }}
        </router-link>
        <span class="text-foreground-subtle">·</span>
        <router-link to="/privacy" class="text-info-400 hover:text-info-300 transition-colors">
          {{ t('footer.privacy_policy') }}
        </router-link>
        <span class="text-foreground-subtle">·</span>
        <router-link to="/credits" class="text-info-400 hover:text-info-300 transition-colors">
          {{ t('footer.credits') }}
        </router-link>
        <template v-if="analyticsConfigured">
          <span class="text-foreground-subtle">·</span>
          <button
            type="button"
            class="text-info-400 hover:text-info-300 transition-colors"
            @click="openAnalyticsPreferences"
          >
            {{ t('footer.analytics_preferences') }}
          </button>
        </template>
      </div>
      <div class="text-foreground-subtle text-center text-xs">
        <div
          class="text-foreground-muted flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
        >
          <span>TarkovTracker &copy; 2020–{{ new Date().getFullYear() }}</span>
          <span class="text-foreground-subtle">·</span>
          <span class="text-foreground-muted font-mono">v{{ appVersion }}</span>
        </div>
        <p class="text-foreground-muted mt-1">{{ t('footer.game_attribution') }}</p>
      </div>
    </div>
  </footer>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const appVersion = runtimeConfig.public.appVersion || 'dev';
  const analyticsConfigured = [
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
