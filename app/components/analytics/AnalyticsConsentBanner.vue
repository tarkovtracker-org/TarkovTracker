<template>
  <div
    v-if="isVisible"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="consentTitleId"
    :aria-describedby="consentDescriptionId"
    class="pointer-events-none fixed inset-x-0 bottom-4 z-[70] px-4"
  >
    <div class="pointer-events-auto mx-auto max-w-5xl">
      <UCard class="border-surface-700/80 bg-surface-900/95 border shadow-xl backdrop-blur">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
          <div class="space-y-3">
            <p class="text-primary-300 text-xs font-semibold tracking-[0.25em] uppercase">
              {{ t('analytics_consent.eyebrow') }}
            </p>
            <div class="space-y-1">
              <h2 :id="consentTitleId" class="text-lg font-semibold text-white">
                {{ consentTitle }}
              </h2>
              <p
                :id="consentDescriptionId"
                class="text-surface-300 max-w-2xl text-sm leading-relaxed"
              >
                {{ consentDescription }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge color="neutral" variant="soft" size="sm">
                {{ t('analytics_consent.badge_default_off') }}
              </UBadge>
              <UBadge color="info" variant="soft" size="sm">
                {{ t('analytics_consent.badge_usage_stats') }}
              </UBadge>
              <UBadge color="warning" variant="soft" size="sm">
                {{ t('analytics_consent.badge_analytics_only') }}
              </UBadge>
            </div>
            <div
              class="text-surface-400 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-relaxed"
            >
              <span>{{ t('analytics_consent.change_anytime') }}</span>
              <router-link to="/privacy" class="text-info-300 hover:text-info-200 underline">
                {{ t('analytics_consent.review_details') }}
              </router-link>
            </div>
          </div>
          <div class="bg-surface-950/70 border-surface-800/80 rounded-xl border p-2">
            <div class="flex flex-col gap-2">
              <UButton
                color="primary"
                variant="solid"
                class="w-full justify-center"
                @click="accept"
              >
                {{ t('analytics_consent.allow') }}
              </UButton>
              <UButton
                color="neutral"
                variant="outline"
                class="w-full justify-center"
                @click="decline"
              >
                {{ t('analytics_consent.decline') }}
              </UButton>
            </div>
            <UButton
              v-if="hasAnswered"
              color="neutral"
              variant="ghost"
              class="mt-1 w-full justify-center"
              @click="closePreferences"
            >
              {{ t('generic.close_button') }}
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { shouldEnableAnalyticsIntegrations } from '@/utils/runtimeConfig';
  const { t } = useI18n({ useScope: 'global' });
  const { accept, closePreferences, decline, hasAnswered, isPromptOpen, state } =
    useAnalyticsConsent();
  const runtimeConfig = useRuntimeConfig();
  const consentDescriptionId = 'analytics-consent-description';
  const consentTitleId = 'analytics-consent-title';
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
  const isVisible = computed(() => analyticsConfigured && isPromptOpen.value);
  const consentTitle = computed(() => {
    if (state.value.status === 'unknown') {
      return t('analytics_consent.title');
    }
    return t('analytics_consent.title_answered');
  });
  const consentDescription = computed(() => {
    if (state.value.status === 'accepted') {
      return t('analytics_consent.accepted');
    }
    if (state.value.status === 'declined') {
      return t('analytics_consent.declined');
    }
    return t('analytics_consent.description');
  });
</script>
