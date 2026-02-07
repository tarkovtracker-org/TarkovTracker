<template>
  <UApp :tooltip="{ delayDuration: 300 }">
    <!-- Loading Screen (shows while initial data is loading) -->
    <LoadingScreen />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- Portal target for modals -->
    <div id="modals"></div>
  </UApp>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useAppInitialization } from '@/composables/useAppInitialization';
  useAppInitialization();
  const route = useRoute();
  const { locale } = useI18n();
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
</script>
