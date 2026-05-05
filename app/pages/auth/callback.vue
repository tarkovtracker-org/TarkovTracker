<template>
  <div class="bg-surface-900 flex min-h-screen items-center justify-center px-4">
    <UCard
      class="bg-surface-900 w-full max-w-md border border-white/10 shadow-2xl"
      :ui="{ body: 'p-8' }"
    >
      <div class="flex flex-col items-center space-y-3 text-center">
        <UIcon name="i-heroicons-arrow-path" class="text-primary-500 h-10 w-10 animate-spin" />
        <h2 class="text-surface-50 text-lg font-semibold">{{ t('page.login.authenticating') }}</h2>
        <p class="text-surface-300 text-sm">{{ t('page.login.authenticating_description') }}</p>
      </div>
    </UCard>
  </div>
</template>
<script setup lang="ts">
  import { useDiagnosticToast } from '@/composables/useDiagnosticToast';
  import { useProductAnalytics } from '@/composables/useProductAnalytics';
  import { buildDiagnosticReport, getErrorSummary } from '@/utils/errorDiagnostics';
  import { sanitizeInternalRedirect } from '@/utils/redirect';
  const AUTH_CALLBACK_HASH_SETTLE_TIMEOUT_MS = 500;
  const AUTH_SESSION_SETTLE_TIMEOUT_MS = 5000;
  const { clearPendingLoginProvider, trackLoginSucceeded } = useProductAnalytics();
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const { showErrorToast, showSuccessToast } = useDiagnosticToast();
  const route = useRoute();
  const getCallbackDebugContext = (stage: string) => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return {
      hasAccessTokenHash: hashParams.has('access_token'),
      hasCodeParam: searchParams.has('code'),
      hasErrorParam: searchParams.has('error') || hashParams.has('error'),
      hasRefreshTokenHash: hashParams.has('refresh_token'),
      path: window.location.pathname,
      stage,
    };
  };
  const buildFailureResult = (stage: string, error: unknown, code?: string, message?: string) => {
    const normalizedError =
      code || message
        ? {
            ...(error && typeof error === 'object' ? error : {}),
            ...(code ? { code } : {}),
            ...(message ? { message } : {}),
          }
        : error;
    return {
      authenticated: false as const,
      description: getErrorSummary(normalizedError, t('page.login.error_description')),
      report: buildDiagnosticReport({
        title: 'OAuth login failed',
        error: normalizedError,
        context: getCallbackDebugContext(stage),
      }),
    };
  };
  const getCallbackError = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const error = searchParams.get('error') || hashParams.get('error');
    if (!error) {
      return null;
    }
    return {
      code:
        searchParams.get('error_code') ||
        hashParams.get('error_code') ||
        error ||
        'OAUTH_CALLBACK_ERROR',
      message:
        searchParams.get('error_description') ||
        hashParams.get('error_description') ||
        'OAuth provider returned an error.',
    };
  };
  const finalizeLoginTracking = () => {
    if ($supabase.user.loggedIn) {
      trackLoginSucceeded();
      return;
    }
    clearPendingLoginProvider();
  };
  const waitForAuthenticatedSession = async () => {
    try {
      const callbackError = getCallbackError();
      if (callbackError) {
        return buildFailureResult(
          'oauth_callback_error',
          callbackError,
          callbackError.code,
          callbackError.message
        );
      }
      await new Promise((resolve) => {
        setTimeout(resolve, AUTH_CALLBACK_HASH_SETTLE_TIMEOUT_MS);
      });
      await $supabase.ready();
      if ($supabase.user.loggedIn) {
        return { authenticated: true as const };
      }
      return await new Promise<
        { authenticated: true } | { authenticated: false; description: string; report: string }
      >((resolve) => {
        let settled = false;
        const finish = (
          value:
            | { authenticated: true }
            | { authenticated: false; description: string; report: string }
        ) => {
          if (settled) {
            return;
          }
          settled = true;
          stop();
          window.clearTimeout(timeoutId);
          resolve(value);
        };
        const stop = watch(
          () => $supabase.user.loggedIn,
          (loggedIn) => {
            if (loggedIn) {
              finish({ authenticated: true });
            }
          }
        );
        const timeoutId = window.setTimeout(() => {
          finish(
            buildFailureResult('oauth_callback_timeout', {
              code: 'OAUTH_SESSION_TIMEOUT',
              message: 'Session was not established after OAuth callback.',
            })
          );
        }, AUTH_SESSION_SETTLE_TIMEOUT_MS);
      });
    } catch (error) {
      return buildFailureResult('oauth_callback_ready', error);
    }
  };
  onMounted(async () => {
    const isPopup = window.opener && !window.opener.closed;
    const result = await waitForAuthenticatedSession();
    finalizeLoginTracking();
    if (isPopup) {
      window.opener.postMessage(
        result.authenticated
          ? { type: 'OAUTH_SUCCESS' }
          : {
              type: 'OAUTH_ERROR',
              description: result.description,
              report: result.report,
            },
        window.location.origin
      );
      setTimeout(() => {
        window.close();
      }, 200);
      return;
    }
    if (!result.authenticated) {
      showErrorToast({
        title: t('page.login.error_title'),
        description: result.description,
        report: result.report,
      });
      await navigateTo(
        {
          path: '/login',
          query: typeof route.query.redirect === 'string' ? { redirect: route.query.redirect } : {},
        },
        { replace: true }
      );
      return;
    }
    showSuccessToast({
      title: t('page.login.success_title'),
    });
    const redirect = sanitizeInternalRedirect(route.query.redirect);
    await navigateTo(redirect, { replace: true });
  });
</script>
