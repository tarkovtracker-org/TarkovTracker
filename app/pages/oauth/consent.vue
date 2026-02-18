<script setup lang="ts">
  import { useOAuthConsent } from '@/composables/useOAuthConsent';
  import { logger } from '@/utils/logger';
  import {
    sanitizeForDebugLog,
    toSafeRedirectUri,
    validateOAuthRedirectUri,
  } from '@/utils/oauthConsent';
  const route = useRoute();
  const { t } = useI18n({ useScope: 'global' });
  const { client: supabase } = useNuxtApp().$supabase;
  const { authorizationId, details, error, init, loading } = useOAuthConsent({
    navigateToFn: navigateTo,
    oauthLogger: logger,
    route,
  });
  onMounted(async () => {
    await init();
  });
  function redirectToOAuthCallback(redirectUrl: string) {
    const expectedRedirectUri = details.value?.redirect_uri ?? details.value?.redirect_url;
    const isSafeRedirect = validateOAuthRedirectUri(redirectUrl, {
      expectedRedirectUri,
      preservedQuerySource: details.value?.redirect_url,
    });
    if (!isSafeRedirect) {
      logger.warn('[OAuth] Blocked invalid redirect URL:', {
        authorizationId: authorizationId.value,
        redirectUri: toSafeRedirectUri(redirectUrl),
      });
      throw new Error('Invalid redirect URL returned');
    }
    window.location.href = redirectUrl;
  }
  async function approve() {
    loading.value = true;
    error.value = '';
    try {
      logger.debug('[OAuth] Approving authorization:', authorizationId.value);
      const { data, error: approveError } = await supabase.auth.oauth.approveAuthorization(
        authorizationId.value
      );
      const safeApproveResult = {
        approved: !approveError,
        authorizationId: authorizationId.value,
        clientId: details.value?.client?.id ?? null,
        redirectUri: toSafeRedirectUri(data?.redirect_url),
        scopes: details.value?.scope?.split(' ').filter(Boolean) ?? [],
      };
      const sanitizedApproveError = approveError
        ? sanitizeForDebugLog({
            message: approveError.message,
            code: 'code' in approveError ? approveError.code : undefined,
            type: approveError.name,
          })
        : null;
      logger.debug('[OAuth] Approve result:', {
        error: sanitizedApproveError,
        result: safeApproveResult,
      });
      if (approveError) throw approveError;
      if (data?.redirect_url) {
        logger.debug('[OAuth] Redirecting to:', toSafeRedirectUri(data.redirect_url));
        redirectToOAuthCallback(data.redirect_url);
      } else {
        throw new Error('No redirect URL returned');
      }
    } catch (e) {
      logger.error('[OAuth] Approve error:', e);
      error.value = e instanceof Error ? e.message : 'Failed to approve authorization';
      loading.value = false;
    }
  }
  async function deny() {
    loading.value = true;
    error.value = '';
    try {
      logger.debug('[OAuth] Denying authorization:', authorizationId.value);
      const { data, error: denyError } = await supabase.auth.oauth.denyAuthorization(
        authorizationId.value
      );
      if (denyError) throw denyError;
      logger.debug('[OAuth] Deny result:', {
        authorizationId: authorizationId.value,
        redirect_url: toSafeRedirectUri(data?.redirect_url),
      });
      if (data?.redirect_url) {
        redirectToOAuthCallback(data.redirect_url);
      } else {
        throw new Error('No redirect URL returned');
      }
    } catch (e) {
      logger.error(`Failed to deny authorization for authorizationId=${authorizationId.value}:`, e);
      error.value = 'Failed to deny authorization. Please try again.';
    } finally {
      loading.value = false;
    }
  }
  useHead({
    title: 'OAuth Consent - TarkovTracker',
  });
</script>
<template>
  <div class="bg-surface-950 flex min-h-screen items-center justify-center p-4">
    <div
      class="bg-surface-900 border-surface-700/60 w-full max-w-md rounded-lg border p-6 shadow-lg"
    >
      <h1 class="text-surface-50 mb-6 text-2xl font-bold">
        {{ t('oauth.consent.authorize') }}
      </h1>
      <div v-if="loading" class="py-8 text-center">
        <div
          class="border-primary-400 inline-block h-8 w-8 animate-spin rounded-full border-b-2"
        ></div>
        <p class="text-surface-300 mt-4">{{ t('oauth.consent.loading') }}</p>
      </div>
      <div v-else-if="error" class="border-error-500/40 bg-error-500/10 mb-4 rounded border p-4">
        <p class="text-error-300 text-sm">
          {{ t('oauth.consent.error', { error }) }}
        </p>
      </div>
      <div v-else-if="details">
        <div class="mb-6">
          <p class="text-surface-300 mb-4">
            <strong class="text-surface-100">
              {{ details.client?.name || t('oauth.consent.unknown') }}
            </strong>
            {{ t('oauth.consent.requesting_access') }}
          </p>
          <div v-if="details.scope" class="bg-surface-800 mb-4 rounded p-4">
            <h3 class="text-surface-100 mb-2 font-semibold">
              {{ t('oauth.consent.requested_permissions') }}
            </h3>
            <ul class="list-inside list-disc space-y-1">
              <li
                v-for="scope in details.scope?.split(' ') || []"
                :key="scope"
                class="text-surface-300 text-sm"
              >
                {{ scope }}
              </li>
            </ul>
          </div>
          <p v-if="details.redirect_url" class="text-surface-400 mb-4 text-xs">
            {{ t('oauth.consent.redirect_to') }}
            <span class="font-mono">{{ details.redirect_url }}</span>
          </p>
        </div>
        <div class="flex gap-3">
          <button
            :disabled="loading"
            class="bg-primary-500 hover:bg-primary-600 disabled:bg-primary-500/60 flex-1 rounded px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            @click="approve"
          >
            {{ t('oauth.consent.approve') }}
          </button>
          <button
            :disabled="loading"
            class="bg-surface-800 hover:bg-surface-700 text-surface-100 flex-1 rounded px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            @click="deny"
          >
            {{ t('oauth.consent.deny') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
