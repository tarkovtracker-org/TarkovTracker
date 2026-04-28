<template>
  <UApp :tooltip="{ delayDuration: 300 }">
    <LoadingScreen />
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtErrorBoundary @error="handlePageError">
        <NuxtPage />
        <template #error="{ clearError, error }">
          <div class="bg-surface-900 border-surface-700/60 rounded-xl border p-6 text-center">
            <p class="text-surface-100 text-sm">{{ getPageErrorMessage(error) }}</p>
            <UButton
              class="mt-4"
              color="primary"
              size="sm"
              @click="handlePageRetry(clearError, error)"
            >
              {{ t('buttons.retry') }}
            </UButton>
          </div>
        </template>
      </NuxtErrorBoundary>
    </NuxtLayout>
    <div id="modals"></div>
  </UApp>
</template>
<script setup lang="ts">
  import { useAppInitialization } from '@/composables/useAppInitialization';
  import { SETTINGS_ROUTE_PATHS } from '@/features/drawer/navigation';
  import { logger } from '@/utils/logger';
  const CHUNK_ERROR_PATTERNS = [
    /ChunkLoadError/i,
    /Failed to fetch dynamically imported module/i,
    /Failed to load module script/i,
    /Importing a module script failed/i,
    /Loading (CSS )?chunk/i,
  ];
  const NETWORK_ERROR_PATTERNS = [
    /ERR_NETWORK_ACCESS_DENIED/i,
    /NETWORK_ACCESS_DENIED/i,
    /Failed to fetch/i,
    /NetworkError/i,
    /Load failed/i,
  ];
  const AUTO_RETRY_STORAGE_KEY = 'tt:auto-reload-on-asset-error';
  const AUTO_RETRY_COOLDOWN_MS = 120000;
  useAppInitialization();
  const route = useRoute();
  const { locale, t } = useI18n();
  const { public: publicConfig } = useRuntimeConfig();
  const siteUrl = (publicConfig.appUrl || 'https://tarkovtracker.org').replace(/\/$/, '');
  const settingsHashCanonicalPaths: Record<string, string> = {
    '#progression': '/progression',
    '#settings-progression': '/progression',
    '#prestige': '/prestige',
    '#settings-prestige': '/prestige',
    '#preferences': '/preferences',
    '#settings-preferences': '/preferences',
    '#account': '/account',
    '#settings-account': '/account',
    '#imports': '/settings',
    '#settings-imports': '/settings',
    '#backup-restore': '/settings',
    '#settings-backup-restore': '/settings',
    '#api': '/settings',
  };
  const canonicalPath = computed(() => {
    if (SETTINGS_ROUTE_PATHS.has(route.path)) {
      if (!route.hash) {
        return route.path === '/settings' ? '/progression' : route.path;
      }
      const normalizedHash = route.hash.startsWith('#') ? route.hash : `#${route.hash}`;
      return settingsHashCanonicalPaths[normalizedHash] ?? route.path;
    }
    return route.path;
  });
  useHead(() => ({
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
        href: `${siteUrl}${canonicalPath.value}`,
      },
    ],
  }));
  useSeoMeta({
    ogUrl: computed(() => `${siteUrl}${canonicalPath.value}`),
    ogLocale: computed(() => locale.value),
  });
  const handlePageError = (error: unknown) => {
    logger.error('[AppErrorBoundary]', {
      error,
      route: route.fullPath,
    });
    if (!isChunkLoadError(error) || !shouldAutoRetryChunkReload()) {
      return;
    }
    markChunkReloadAttempt();
    logger.warn('[ChunkRecovery] Triggering hard reload after chunk load failure', {
      route: route.fullPath,
    });
    forceHardReload();
  };
  const handlePageRetry = (clearError: () => void, error: unknown): void => {
    if (isChunkLoadError(error) || isNetworkRequestError(error)) {
      markChunkReloadAttempt();
      forceHardReload();
      return;
    }
    clearError();
  };
  const readErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      return error.message.trim();
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
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim();
    }
    return '';
  };
  const getErrorTextCandidates = (error: unknown): string[] => {
    const rootMessage = readErrorMessage(error);
    const causeMessage =
      typeof error === 'object' && error !== null && 'cause' in error
        ? readErrorMessage((error as { cause?: unknown }).cause)
        : '';
    const reasonMessage =
      typeof error === 'object' && error !== null && 'reason' in error
        ? readErrorMessage((error as { reason?: unknown }).reason)
        : '';
    return [rootMessage, causeMessage, reasonMessage].filter((value) => value.length > 0);
  };
  const matchesAnyPattern = (error: unknown, patterns: RegExp[]): boolean => {
    const messages = getErrorTextCandidates(error);
    return messages.some((message) => patterns.some((pattern) => pattern.test(message)));
  };
  const isChunkLoadError = (error: unknown): boolean =>
    matchesAnyPattern(error, CHUNK_ERROR_PATTERNS);
  const isNetworkRequestError = (error: unknown): boolean =>
    matchesAnyPattern(error, NETWORK_ERROR_PATTERNS);
  const shouldAutoRetryChunkReload = (): boolean => {
    if (!import.meta.client) {
      return false;
    }
    try {
      const lastAttemptAtRaw = window.sessionStorage.getItem(AUTO_RETRY_STORAGE_KEY);
      if (!lastAttemptAtRaw) {
        return true;
      }
      const lastAttemptAt = Number.parseInt(lastAttemptAtRaw, 10);
      if (Number.isNaN(lastAttemptAt)) {
        return true;
      }
      return Date.now() - lastAttemptAt > AUTO_RETRY_COOLDOWN_MS;
    } catch {
      return true;
    }
  };
  const markChunkReloadAttempt = (): void => {
    if (!import.meta.client) {
      return;
    }
    try {
      window.sessionStorage.setItem(AUTO_RETRY_STORAGE_KEY, String(Date.now()));
    } catch {
      return;
    }
  };
  const forceHardReload = (): void => {
    if (!import.meta.client) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('_tt_retry', String(Date.now()));
    window.location.replace(url.toString());
  };
  const getPageErrorMessage = (error: unknown): string => {
    const resolveErrorMessage = (key: string, fallback: string): string => {
      const localized = t(key);
      if (localized.trim().length === 0 || localized === key) {
        return fallback;
      }
      return localized;
    };
    if (isChunkLoadError(error)) {
      return resolveErrorMessage(
        'errors.chunk_load_blocked',
        'A required app file could not load. Please retry. If this keeps happening, your ISP or region may be blocking access.'
      );
    }
    if (isNetworkRequestError(error)) {
      return resolveErrorMessage(
        'errors.network_access_denied',
        'A required network request was blocked. Please retry. If it keeps failing, try VPN or Cloudflare WARP.'
      );
    }
    const message = readErrorMessage(error);
    if (message.length > 0) {
      return message;
    }
    return t('errors.generic_fallback');
  };
</script>
