<template>
  <div class="bg-surface-950 flex min-h-0 flex-1 items-center justify-center px-4 py-8">
    <UCard
      class="bg-surface-850 w-full max-w-md shadow-2xl ring-1 shadow-black/50 ring-white/15"
      :ui="{
        root: 'divide-y-0',
        body: 'p-0 sm:p-0',
        header: 'p-0 sm:px-0',
        footer: 'p-0 sm:px-0',
      }"
      role="article"
      :aria-label="$t('page.login.login_options')"
    >
      <template #header>
        <div class="flex flex-col items-center px-8 pt-8 pb-6 text-center">
          <h1 class="mb-4 text-4xl font-bold tracking-tight text-white">
            {{ $t('page.login.title') }}
          </h1>
          <p class="text-surface-200 text-lg">
            {{ $t('page.login.subtitle') }}
          </p>
        </div>
      </template>
      <div class="px-8 pb-8">
        <div
          v-if="isOfflineMode"
          class="mb-6 rounded-lg bg-amber-500/10 p-4 ring-1 ring-amber-500/30"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-heroicons-information-circle"
              class="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
            />
            <div>
              <p class="font-medium text-amber-200">Running in Offline Mode</p>
              <p class="mt-1 text-sm text-amber-300/80">
                Supabase is not configured. Login and sync features are disabled, but you can still
                use all tracking features locally. See
                <code class="rounded bg-amber-500/20 px-1 text-amber-200">.env.example</code>
                to enable login.
              </p>
            </div>
          </div>
        </div>
        <div class="w-full space-y-6">
          <UButton
            block
            size="xl"
            variant="solid"
            :style="{ backgroundColor: 'var(--color-twitch)' }"
            class="hover:bg-twitch-hover hover:shadow-twitch/25 flex h-12 w-full items-center justify-center text-white ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            :loading="loading.twitch"
            :disabled="
              isOfflineMode || loading.twitch || loading.discord || loading.google || loading.github
            "
            :aria-label="$t('page.login.continue_twitch')"
            @click="signInWithTwitch"
          >
            <UIcon name="i-mdi-twitch" class="mr-3 h-6 w-6 shrink-0 text-white" />
            <span class="font-medium whitespace-nowrap text-white">
              {{ $t('page.login.continue_twitch') }}
            </span>
          </UButton>
          <UButton
            block
            size="xl"
            variant="solid"
            :style="{ backgroundColor: 'var(--color-discord)' }"
            class="hover:bg-discord-hover hover:shadow-discord/25 flex h-12 w-full items-center justify-center text-white ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            :loading="loading.discord"
            :disabled="
              isOfflineMode || loading.twitch || loading.discord || loading.google || loading.github
            "
            :aria-label="$t('page.login.continue_discord')"
            @click="signInWithDiscord"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="mr-3 h-6 w-6 shrink-0 text-white"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z"
              />
            </svg>
            <span class="font-medium whitespace-nowrap text-white">
              {{ $t('page.login.continue_discord') }}
            </span>
          </UButton>
          <UButton
            block
            size="xl"
            variant="solid"
            class="ring-surface-600 hover:bg-surface-100 flex h-12 w-full items-center justify-center bg-white ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10"
            :loading="loading.google"
            :disabled="
              isOfflineMode || loading.twitch || loading.discord || loading.google || loading.github
            "
            :aria-label="$t('page.login.continue_google')"
            @click="signInWithGoogle"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              class="mr-3 h-6 w-6 shrink-0"
              aria-hidden="true"
              focusable="false"
            >
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span class="text-surface-900 font-medium whitespace-nowrap">
              {{ $t('page.login.continue_google') }}
            </span>
          </UButton>
          <UButton
            block
            size="xl"
            variant="solid"
            :style="{ backgroundColor: 'var(--color-github)' }"
            class="ring-surface-600 hover:bg-github-hover hover:shadow-github/25 flex h-12 w-full items-center justify-center text-white ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            :loading="loading.github"
            :disabled="
              isOfflineMode || loading.twitch || loading.discord || loading.google || loading.github
            "
            :aria-label="$t('page.login.continue_github')"
            @click="signInWithGitHub"
          >
            <UIcon name="i-mdi-github" class="mr-3 h-6 w-6 shrink-0 text-white" />
            <span class="font-medium whitespace-nowrap text-white">
              {{ $t('page.login.continue_github') }}
            </span>
          </UButton>
        </div>
      </div>
      <template #footer>
        <div class="w-full border-t border-white/10 bg-black/20">
          <div class="flex items-center justify-between px-8 py-4">
            <UButton
              to="/privacy"
              target="_blank"
              variant="ghost"
              color="neutral"
              size="sm"
              class="text-surface-500 hover:text-surface-300 transition-colors"
            >
              {{ $t('page.login.privacy_policy') }}
            </UButton>
            <UButton
              to="/terms-of-service"
              target="_blank"
              variant="ghost"
              color="neutral"
              size="sm"
              class="text-surface-500 hover:text-surface-300 transition-colors"
            >
              {{ $t('page.login.terms_of_service') }}
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { logger } from '@/utils/logger';
  import { sanitizeInternalRedirect } from '@/utils/redirect';
  useSeoMeta({
    title: 'Login',
    description:
      'Sign in to TarkovTracker to sync your progress across devices and collaborate with your team.',
  });
  const { $supabase } = useNuxtApp();
  const isOfflineMode = computed(() => $supabase.isOfflineMode === true);
  const loading = ref({
    twitch: false,
    discord: false,
    google: false,
    github: false,
  });
  const route = useRoute();
  const buildCallbackUrl = () => {
    const config = useRuntimeConfig();
    const origin = typeof window !== 'undefined' ? window.location.origin : config.public.appUrl;
    const redirect = sanitizeInternalRedirect(route.query.redirect, '');
    const callbackUrl = new URL('/auth/callback', origin);
    if (redirect) {
      callbackUrl.searchParams.set('redirect', redirect);
    }
    return callbackUrl.toString();
  };
  const toast = useToast();
  const { t } = useI18n({ useScope: 'global' });
  const fallbackToRedirect = (
    url: string,
    provider: 'twitch' | 'discord' | 'google' | 'github'
  ) => {
    logger.warn('[Login] Popup was blocked or failed, falling back to redirect');
    toast.add({
      title: t('page.login.popup_blocked_title'),
      description: t('page.login.popup_blocked_description'),
      icon: 'i-heroicons-information-circle',
      duration: 3000,
    });
    setTimeout(() => {
      loading.value[provider] = false;
      window.location.href = url;
    }, 1500);
  };
  const openPopupOrRedirect = (
    url: string,
    provider: 'twitch' | 'discord' | 'google' | 'github'
  ) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    let popup: Window | null = null;
    try {
      popup = window.open(
        url,
        'oauth-popup',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
      );
    } catch {
      fallbackToRedirect(url, provider);
      return;
    }
    const isPopupClosed = () => {
      try {
        return !popup || popup.closed;
      } catch (err) {
        logger.debug('[Login] Cross-origin popup access (expected)', err);
        return true;
      }
    };
    if (isPopupClosed()) {
      fallbackToRedirect(url, provider);
      return;
    }
    let didCleanup = false;
    const isOAuthSuccessMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return false;
      if (event.source !== popup) return false;
      const data = event.data;
      if (!data || typeof data !== 'object') return false;
      if (!('type' in data)) return false;
      return (data as { type?: unknown }).type === 'OAUTH_SUCCESS';
    };
    const isOAuthErrorMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return false;
      if (event.source !== popup) return false;
      const data = event.data;
      if (!data || typeof data !== 'object') return false;
      if (!('type' in data)) return false;
      return (data as { type?: unknown }).type === 'OAUTH_ERROR';
    };
    const messageHandler = (event: MessageEvent) => {
      if (isOAuthErrorMessage(event)) {
        loading.value[provider] = false;
        cleanup();
        toast.add({
          title: t('page.login.error_title'),
          description: t('page.login.error_description'),
          icon: 'i-heroicons-exclamation-circle',
          color: 'error',
        });
        return;
      }
      if (!isOAuthSuccessMessage(event)) return;
      loading.value[provider] = false;
      cleanup();
      const redirect = sanitizeInternalRedirect(route.query.redirect);
      navigateTo(redirect, { replace: true });
    };
    const pollTimer = window.setInterval(() => {
      if (isPopupClosed()) {
        loading.value[provider] = false;
        cleanup();
      }
    }, 500);
    const abandonedTimer = window.setTimeout(() => {
      if (didCleanup) return;
      loading.value[provider] = false;
      cleanup();
    }, 300000);
    const fallbackTimer = window.setTimeout(() => {
      if (didCleanup) return;
      if (isPopupClosed()) {
        cleanup();
        fallbackToRedirect(url, provider);
      }
    }, 100);
    const cleanup = () => {
      if (didCleanup) return;
      didCleanup = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(abandonedTimer);
      window.removeEventListener('message', messageHandler);
      try {
        if (popup && !popup.closed) {
          popup.close();
        }
      } catch (err) {
        logger.debug('[Login] Could not close popup (cross-origin)', err);
        popup = null;
      }
    };
    window.addEventListener('message', messageHandler);
  };
  const signInWithTwitch = async () => {
    try {
      loading.value.twitch = true;
      const callbackUrl = buildCallbackUrl();
      const data = await $supabase.signInWithOAuth('twitch', {
        skipBrowserRedirect: true,
        redirectTo: callbackUrl,
      });
      if (data?.url) {
        openPopupOrRedirect(data.url, 'twitch');
      }
    } catch (error) {
      logger.error('[Login] Twitch sign in error:', error);
      loading.value.twitch = false;
    }
  };
  const signInWithDiscord = async () => {
    try {
      loading.value.discord = true;
      const callbackUrl = buildCallbackUrl();
      const data = await $supabase.signInWithOAuth('discord', {
        skipBrowserRedirect: true,
        redirectTo: callbackUrl,
      });
      if (data?.url) {
        openPopupOrRedirect(data.url, 'discord');
      }
    } catch (error) {
      logger.error('[Login] Discord sign in error:', error);
      loading.value.discord = false;
    }
  };
  const signInWithGoogle = async () => {
    try {
      loading.value.google = true;
      const callbackUrl = buildCallbackUrl();
      const data = await $supabase.signInWithOAuth('google', {
        skipBrowserRedirect: true,
        redirectTo: callbackUrl,
      });
      if (data?.url) {
        openPopupOrRedirect(data.url, 'google');
      }
    } catch (error) {
      logger.error('[Login] Google sign in error:', error);
      loading.value.google = false;
    }
  };
  const signInWithGitHub = async () => {
    try {
      loading.value.github = true;
      const callbackUrl = buildCallbackUrl();
      const data = await $supabase.signInWithOAuth('github', {
        skipBrowserRedirect: true,
        redirectTo: callbackUrl,
      });
      if (data?.url) {
        openPopupOrRedirect(data.url, 'github');
      }
    } catch (error) {
      logger.error('[Login] GitHub sign in error:', error);
      loading.value.github = false;
    }
  };
</script>
