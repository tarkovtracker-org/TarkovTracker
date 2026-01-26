<template>
  <div class="bg-surface-950 flex min-h-screen items-center justify-center p-4">
    <UCard
      class="bg-surface-900 w-full max-w-xl shadow-2xl ring-1 ring-white/10"
      :ui="{
        body: 'p-0',
        header: 'p-0',
        footer: 'p-0',
      }"
    >
      <!-- Header Section -->
      <div class="flex flex-col items-center px-10 pt-10 pb-8 text-center">
        <h1 class="mb-4 text-4xl font-bold tracking-tight text-white">
          {{ $t('page.login.title') }}
        </h1>
        <p class="text-lg text-gray-400">
          {{ $t('page.login.subtitle') }}
        </p>
      </div>
      <!-- Auth Buttons -->
      <div class="px-10 pb-10">
        <div class="w-full space-y-4">
          <UButton
            block
            size="xl"
            variant="solid"
            class="flex h-12 w-full items-center justify-center border-none bg-[#9146FF] text-white transition-colors hover:bg-[#9146FF]/90"
            :loading="loading.twitch"
            :disabled="loading.twitch || loading.discord || loading.google || loading.github"
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
            class="flex h-12 w-full items-center justify-center border-none bg-[#5865F2] text-white transition-colors hover:bg-[#5865F2]/90"
            :loading="loading.discord"
            :disabled="loading.twitch || loading.discord || loading.google || loading.github"
            @click="signInWithDiscord"
          >
            <UIcon name="i-mdi-controller" class="mr-3 h-6 w-6 shrink-0 text-white" />
            <span class="font-medium whitespace-nowrap text-white">
              {{ $t('page.login.continue_discord') }}
            </span>
          </UButton>
          <UButton
            block
            size="xl"
            variant="solid"
            class="flex h-12 w-full items-center justify-center border-none bg-white text-gray-700 transition-colors hover:bg-gray-100"
            :loading="loading.google"
            :disabled="loading.twitch || loading.discord || loading.google || loading.github"
            @click="signInWithGoogle"
          >
            <UIcon name="i-mdi-google" class="mr-3 h-6 w-6 shrink-0 text-gray-700" />
            <span class="font-medium whitespace-nowrap text-gray-700">
              {{ $t('page.login.continue_google') }}
            </span>
          </UButton>
          <UButton
            block
            size="xl"
            variant="solid"
            class="flex h-12 w-full items-center justify-center border-none bg-[#24292e] text-white transition-colors hover:bg-[#24292e]/90"
            :loading="loading.github"
            :disabled="loading.twitch || loading.discord || loading.google || loading.github"
            @click="signInWithGitHub"
          >
            <UIcon name="i-mdi-github" class="mr-3 h-6 w-6 shrink-0 text-white" />
            <span class="font-medium whitespace-nowrap text-white">
              {{ $t('page.login.continue_github') }}
            </span>
          </UButton>
        </div>
      </div>
      <!-- Footer Links -->
      <div class="rounded-b-lg border-t border-white/5 bg-black/20 px-8 py-5">
        <div class="flex items-center justify-between">
          <UButton
            to="/privacy"
            target="_blank"
            variant="ghost"
            color="neutral"
            size="sm"
            class="text-gray-500 transition-colors hover:text-gray-300"
          >
            {{ $t('page.login.privacy_policy') }}
          </UButton>
          <UButton
            to="/terms-of-service"
            target="_blank"
            variant="ghost"
            color="neutral"
            size="sm"
            class="text-gray-500 transition-colors hover:text-gray-300"
          >
            {{ $t('page.login.terms_of_service') }}
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  // Page metadata
  useSeoMeta({
    title: 'Login',
    description:
      'Sign in to TarkovTracker to sync your progress across devices and collaborate with your team.',
  });
  const { $supabase } = useNuxtApp();
  const route = useRoute();
  const loading = ref({
    twitch: false,
    discord: false,
    google: false,
    github: false,
  });
  const redirectPath = computed(() => {
    const value = route.query.redirect;
    return typeof value === 'string' && value.startsWith('/') ? value : '';
  });
  const buildCallbackUrl = () => {
    const config = useRuntimeConfig();
    const origin = typeof window !== 'undefined' ? window.location.origin : config.public.appUrl;
    const url = new URL('/auth/callback', origin);
    if (redirectPath.value) {
      url.searchParams.set('redirect', redirectPath.value);
    }
    return url.toString();
  };
  const openPopupOrRedirect = (
    url: string,
    provider: 'twitch' | 'discord' | 'google' | 'github'
  ) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      url,
      'oauth-popup',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no`
    );
    if (popup) {
      const messageHandler = (event: MessageEvent) => {
        if (event.origin === window.location.origin && event.data?.type === 'OAUTH_SUCCESS') {
          loading.value[provider] = false;
          cleanup();
          navigateTo(redirectPath.value || '/', { replace: true });
        }
      };
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          loading.value[provider] = false;
          cleanup();
        }
      }, 500);
      function cleanup() {
        clearInterval(pollTimer);
        window.removeEventListener('message', messageHandler);
        if (popup && !popup.closed) {
          popup.close();
        }
      }
      window.addEventListener('message', messageHandler);
    } else {
      logger.warn('[Login] Popup was blocked, falling back to redirect');
      loading.value[provider] = false;
      window.location.href = url;
    }
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
