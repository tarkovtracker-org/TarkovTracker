<template>
  <footer class="bg-surface-900/60 border-surface-800/70 w-full border-t px-4 py-8 sm:px-6 lg:px-8">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
        <div class="min-w-0 lg:col-span-2">
          <NuxtLink
            to="/"
            class="focus-visible:ring-primary-500 inline-flex items-center gap-2.5 rounded focus-visible:ring-2 focus-visible:outline-none"
          >
            <NuxtImg
              src="/img/logos/tarkovtrackerlogo-light.webp"
              alt=""
              width="36"
              height="36"
              class="h-9 w-9 shrink-0"
              loading="lazy"
            />
            <span class="text-base font-medium text-white">
              {{ t('navigation_drawer.brand_name') }}
            </span>
          </NuxtLink>
          <p class="text-surface-400 mt-3 max-w-sm text-xs leading-relaxed">
            {{ t('footer.tagline') }}
          </p>
        </div>
        <AppFooterColumn :title="t('footer.sections.explore')" :items="exploreItems" />
        <AppFooterColumn :title="t('footer.sections.project')" :items="projectItems" />
        <AppFooterColumn :title="t('footer.sections.legal')" :items="legalItems" />
      </div>
      <div
        class="border-surface-800/70 flex flex-col gap-2 border-t pt-5 text-xs sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-surface-400">
          TarkovTracker &copy; 2020–{{ new Date().getFullYear() }}
          <span class="text-surface-400 font-mono">v{{ appVersion }}</span>
        </p>
        <p class="text-surface-400 max-w-xl leading-relaxed">
          {{ t('footer.game_attribution') }}
        </p>
      </div>
    </div>
  </footer>
</template>
<script setup lang="ts">
  import AppFooterColumn from '@/shell/AppFooterColumn.vue';
  import { logger } from '@/utils/logger';
  import { shouldEnableAnalyticsIntegrations } from '@/utils/runtimeConfig';
  import type { FooterNavItem } from '@/shell/footerNavigation';
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
  const exploreItems = computed(() => [
    { label: t('common.dashboard'), to: '/' },
    { label: t('common.tasks'), to: '/tasks' },
    { label: t('common.hideout'), to: '/hideout' },
    { label: t('common.needed_items'), to: '/needed-items' },
    { label: t('common.storyline'), to: '/storyline' },
  ]);
  const projectItems = computed(() => [
    { label: t('common.team'), to: '/team' },
    { label: t('common.supporter'), to: '/supporter' },
    { label: t('navigation_drawer.resources'), to: '/resources' },
    { label: t('common.credits'), to: '/credits' },
    { label: t('page.changelog.title'), to: '/changelog' },
  ]);
  const legalItems = computed(() => {
    const items: FooterNavItem[] = [
      { label: t('common.terms_of_service'), to: '/terms-of-service' },
      { label: t('common.privacy_policy'), to: '/privacy' },
    ];
    if (analyticsConfigured) {
      items.push({ label: t('footer.analytics_preferences'), onClick: openAnalyticsPreferences });
    }
    return items;
  });
</script>
