<template>
  <UModal
    :open="gateVisible"
    :dismissible="false"
    :close="false"
    :title="t('tarkov_access.title')"
    :description="statusMessage"
    :ui="{
      content:
        'inset-x-4 inset-y-auto top-1/2 left-4 mx-auto flex w-auto max-w-md translate-x-0 -translate-y-1/2 flex-col items-stretch justify-start p-0 pointer-events-auto',
      wrapper: 'relative w-auto max-w-none border-0 bg-transparent shadow-none',
    }"
  >
    <template #body>
      <div data-testid="tarkov-access-gate">
        <p role="status" aria-live="polite" class="sr-only">{{ statusMessage }}</p>
        <div v-if="showWidget" class="mt-4">
          <p class="text-surface-400 text-xs">{{ t('tarkov_access.widget_hint') }}</p>
          <div
            ref="widgetContainerRef"
            data-testid="tarkov-access-gate-widget"
            class="mt-2 min-h-16"
          ></div>
        </div>
        <p v-if="showRetry" class="mt-4 flex justify-end">
          <UButton
            color="primary"
            size="sm"
            data-testid="tarkov-access-gate-retry"
            @click="handleRetry"
          >
            {{ t('tarkov_access.retry') }}
          </UButton>
        </p>
      </div>
    </template>
  </UModal>
</template>
<script setup lang="ts">
  import { useTarkovAccess } from '@/composables/useTarkovAccess';
  import { useTurnstileWidget } from '@/composables/useTurnstile';
  import { logger } from '@/utils/logger';
  /**
   * Browser-facing Tarkov access gate. Always mounted at the app root
   * (independent of startup loading state): it only overlays when the shared
   * controller parks on a Cloudflare challenge or a failed verification
   * attempt, and provides a manual retry that re-runs the access flow.
   */
  const access = useTarkovAccess();
  const { t } = useI18n();
  const widgetContainerRef = ref<HTMLElement | null>(null);
  const {
    enabled: isWidgetEnabled,
    getToken: getWidgetToken,
    solved: isWidgetSolved,
    unavailable: isWidgetUnavailable,
    reset: resetWidget,
  } = useTurnstileWidget(widgetContainerRef, {
    siteKey: access.widgetSiteKey,
    action: access.widgetAction,
  });
  const gateVisible = computed(
    () =>
      access.challengeSeen.value &&
      access.accessEnabled &&
      !['released', 'idle', 'probing'].includes(access.phase.value)
  );
  const challengeMessage = computed(() => {
    if (access.attemptsExhausted.value) return t('tarkov_access.verification_failed_retry');
    return showWidget.value
      ? t('tarkov_access.description')
      : t('tarkov_access.widget_unavailable');
  });
  const statusMessage = computed(() => {
    if (access.phase.value === 'challenge') return challengeMessage.value;
    const messages: Record<string, string> = {
      verifying: t('tarkov_access.verifying'),
      blocked: t('tarkov_access.blocked'),
      rate_limited: t('tarkov_access.rate_limited'),
      failed: t('tarkov_access.failed'),
    };
    return messages[access.phase.value] ?? t('tarkov_access.checking');
  });
  const showWidget = computed(
    () =>
      access.phase.value === 'challenge' &&
      access.widgetAvailable &&
      isWidgetEnabled &&
      !access.attemptsExhausted.value
  );
  const showRetry = computed(
    () =>
      (access.phase.value === 'challenge' && access.attemptsExhausted.value) ||
      ['blocked', 'rate_limited', 'failed'].includes(access.phase.value)
  );
  // A solved token is handed to the shared controller exactly once per attempt;
  // a null result means the widget errored before producing a usable token.
  watch(isWidgetSolved, async (solvedNow) => {
    if (!solvedNow) return;
    const token = await getWidgetToken();
    if (!token) {
      access.reportWidgetUnavailable();
      return;
    }
    access.submitToken(token);
  });
  // When the script load budget is exhausted or the widget can never deliver a
  // token, park the attempt so the retry UI appears instead of waiting forever.
  watch(isWidgetUnavailable, (unavailableNow) => {
    if (!unavailableNow) return;
    access.reportWidgetUnavailable();
  });
  // Every new attempt starts with a fresh widget token: reset once per epoch.
  watch(
    () => access.attemptEpoch.value,
    (epoch, previousEpoch) => {
      if (epoch === previousEpoch || !access.accessEnabled) return;
      resetWidget();
    }
  );
  watch(
    () => access.phase.value,
    (phase) => {
      if (phase === 'challenge' && !access.widgetAvailable) {
        access.reportWidgetUnavailable();
      }
    }
  );
  const handleRetry = (): void => {
    resetWidget();
    void access.retry().catch((cause) => {
      logger.debug('[TarkovAccessGate] Manual access retry failed:', cause);
    });
  };
</script>
