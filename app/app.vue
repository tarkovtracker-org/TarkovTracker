<template>
  <UApp :tooltip="{ delayDuration: 300 }">
    <!-- Loading Screen (shows while initial data is loading) -->
    <LoadingScreen />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtErrorBoundary @error="handlePageError">
        <NuxtPage />
        <template #error="{ clearError, error }">
          <div class="bg-surface-900 border-surface-700/60 rounded-xl border p-6 text-center">
            <p class="text-surface-100 text-sm">{{ getPageErrorMessage(error) }}</p>
            <UButton class="mt-4" color="primary" size="sm" @click="clearError()">
              {{ t('buttons.retry') }}
            </UButton>
          </div>
        </template>
      </NuxtErrorBoundary>
    </NuxtLayout>
    <!-- Portal target for modals -->
    <div id="modals"></div>
  </UApp>
</template>
<script setup lang="ts">
  import { useAppInitialization } from '@/composables/useAppInitialization';
  import { logger } from '@/utils/logger';
  useAppInitialization();
  const route = useRoute();
  const { locale, t } = useI18n();
  const { public: publicConfig } = useRuntimeConfig();
  const siteUrl = (publicConfig.appUrl || 'https://tarkovtracker.org').replace(/\/$/, '');
  const webApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'TarkovTracker',
    url: siteUrl,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web',
    description:
      'Complete Escape from Tarkov progress tracker for patch 1.0+. Track quests, storyline, hideout, and needed items.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Organization',
      name: 'TarkovTracker',
      url: siteUrl,
    },
    sameAs: ['https://github.com/tarkovtracker-org/TarkovTracker'],
  };
  useHeadSafe(() => ({
    htmlAttrs: {
      lang: locale.value,
    },
    link: [
      {
        rel: 'preconnect',
        href: 'https://api.iconify.design',
        crossorigin: 'anonymous',
      },
      {
        rel: 'dns-prefetch',
        href: 'https://api.iconify.design',
      },
      {
        rel: 'canonical',
        href: `${siteUrl}${route.path}`,
      },
    ],
    script: [
      {
        type: 'application/ld+json',
        textContent: JSON.stringify(webApplicationSchema),
      },
    ],
  }));
  useSeoMeta({
    ogUrl: computed(() => `${siteUrl}${route.path}`),
    ogLocale: computed(() => locale.value),
  });
  const handlePageError = (error: unknown) => {
    logger.error('[AppErrorBoundary]', {
      error,
      route: route.fullPath,
    });
  };
  const getPageErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string' &&
      (error as { message: string }).message.trim().length > 0
    ) {
      return (error as { message: string }).message;
    }
    return t('errors.generic_fallback');
  };
</script>
