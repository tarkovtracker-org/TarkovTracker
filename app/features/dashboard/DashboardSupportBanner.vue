<template>
  <div v-if="variant" class="mb-3" data-testid="dashboard-support-banner">
    <div
      class="border-success-500/40 border-l-success-500 bg-success-500/10 light:border-success-600/40 light:border-l-success-600 light:bg-success-100 rounded-lg border border-l-4 px-3 py-3"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-start gap-3 text-sm sm:items-center">
          <div
            class="bg-success-500/20 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <UIcon name="i-mdi-heart" class="text-success-400 light:text-success-700 h-5 w-5" />
          </div>
          <div class="min-w-0">
            <p class="light:text-surface-50 text-base font-semibold text-white">
              {{ t(`page.dashboard.support_banner.${variant}_title`) }}
            </p>
            <p class="text-surface-300 light:text-surface-200">
              {{ t(`page.dashboard.support_banner.${variant}_body`) }}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
          <UButton
            size="sm"
            color="success"
            variant="solid"
            class="text-surface-950 light:text-surface-50"
            to="/supporter"
            icon="i-mdi-heart"
            @click="trackEvent('support_banner_click', { variant })"
          >
            {{ t(`page.dashboard.support_banner.${variant}_cta`) }}
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-mdi-close"
            :aria-label="t('common.close', 'Close')"
            @click="dismiss"
          />
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { useNow, useStorage } from '@vueuse/core';
  import { useAnalyticsEvents } from '@/composables/useAnalyticsEvents';
  import { useSupporter } from '@/composables/useSupporter';
  import { resolveSupportBanner } from '@/features/dashboard/supportBanner';
  import { STORAGE_KEYS } from '@/utils/storageKeys';
  const props = defineProps<{ completedTasks: number }>();
  const { t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const { supporter, loadedUserId } = useSupporter();
  const { trackEvent } = useAnalyticsEvents();
  const dismissedAt = useStorage<string | null>(STORAGE_KEYS.supportBannerDismissedAt, null);
  const now = useNow({ interval: 1000 });
  const variant = computed(() =>
    resolveSupportBanner({
      userId: $supabase.user?.loggedIn ? ($supabase.user.id ?? null) : null,
      loadedUserId: loadedUserId.value,
      supporter: supporter.value,
      createdAt: $supabase.user?.createdAt ?? null,
      completedTasks: props.completedTasks,
      dismissedAt: dismissedAt.value,
      nowMs: now.value.getTime(),
    })
  );
  function dismiss() {
    trackEvent('support_banner_dismiss', { variant: variant.value });
    dismissedAt.value = new Date().toISOString();
  }
</script>
