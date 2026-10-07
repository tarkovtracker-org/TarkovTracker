<template>
  <div v-if="variant" class="mb-3" data-testid="dashboard-support-banner">
    <div class="panel px-3 py-2">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex min-w-0 items-start gap-2 text-sm">
          <UIcon name="i-mdi-heart" class="text-success-400 mt-0.5 h-4 w-4 shrink-0" />
          <p class="text-surface-300 min-w-0">
            <span class="light:text-surface-50 font-semibold text-white">
              {{ t(`page.dashboard.support_banner.${variant}_title`) }}
            </span>
            {{ t(`page.dashboard.support_banner.${variant}_body`) }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
          <UButton
            size="xs"
            color="success"
            variant="soft"
            to="/supporter"
            icon="i-mdi-heart-outline"
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
