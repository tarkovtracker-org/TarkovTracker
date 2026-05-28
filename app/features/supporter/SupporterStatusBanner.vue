<template>
  <section v-if="supporter" class="overflow-hidden rounded-2xl border" :class="bannerClasses">
    <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div class="flex items-start gap-4">
        <div
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border"
          :class="iconWrapClasses"
        >
          <UIcon :name="tierIcon" class="h-6 w-6 text-white" />
        </div>
        <div class="space-y-1">
          <p class="text-surface-300 text-xs font-semibold tracking-wider uppercase">
            {{ statusLabel }}
          </p>
          <h2 class="text-xl font-bold text-white">
            {{ tierLabel }}
          </h2>
          <p class="text-surface-300 text-sm">
            {{ summaryText }}
          </p>
        </div>
      </div>
      <div class="flex flex-col gap-2 sm:items-end">
        <UButton
          v-if="canManage"
          color="primary"
          variant="solid"
          size="md"
          :loading="portalLoading"
          icon="i-mdi-credit-card-outline"
          @click="handleManage"
        >
          {{ t('page.supporter.manage_subscription_cta', 'Manage subscription') }}
        </UButton>
        <UButton
          v-else-if="canUpgrade"
          color="primary"
          variant="soft"
          size="md"
          to="#tiers"
          icon="i-mdi-arrow-up-bold-circle-outline"
        >
          {{ t('page.supporter.upgrade_cta', 'Pick a tier') }}
        </UButton>
      </div>
    </div>
    <UAlert
      v-if="portalError"
      color="error"
      variant="soft"
      icon="i-mdi-alert-circle-outline"
      :title="t('page.supporter.portal_error_title', 'Could not open billing portal')"
      :description="portalError"
      :close="true"
      class="mx-5 mb-5 sm:mx-6 sm:mb-6"
      @update:open="portalError = null"
    />
  </section>
</template>
<script setup lang="ts">
  import { useSupporter } from '@/composables/useSupporter';
  import { isSupporterActivityActive } from '@/features/supporter/supporterStatus';
  import { logger } from '@/utils/logger';
  const { t, te, locale } = useI18n({ useScope: 'global' });
  const { supporter, openBillingPortal, error: composableError } = useSupporter();
  const portalLoading = ref(false);
  const portalError = ref<string | null>(null);
  const isActive = computed(() => isSupporterActivityActive(supporter.value));
  const isSubscription = computed(() => supporter.value?.type === 'subscription');
  const canManage = computed(() => isSubscription.value && supporter.value !== null);
  const canUpgrade = computed(() => !isActive.value && supporter.value?.hasEverSupported === true);
  const tierLabel = computed(() => {
    const tier = supporter.value?.tier;
    if (!tier) return '';
    const tierKey = `page.supporter.tier_${tier}_name`;
    if (te(tierKey)) {
      return t(tierKey);
    }
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  });
  const tierIcon = computed(() => {
    switch (supporter.value?.tier) {
      case 'chad':
        return 'i-mdi-crown';
      case 'timmy':
        return 'i-mdi-star';
      case 'scav':
        return 'i-mdi-shield-star';
      default:
        return 'i-mdi-heart';
    }
  });
  const statusLabel = computed(() => {
    if (!supporter.value) return '';
    if (isActive.value) {
      return isSubscription.value
        ? t('page.supporter.status_active_subscription', 'Active subscription')
        : t('page.supporter.status_active_one_time', 'Active supporter');
    }
    switch (supporter.value.status) {
      case 'past_due':
        return t('page.supporter.status_past_due', 'Payment past due');
      case 'cancelled':
        return t('page.supporter.status_cancelled', 'Subscription cancelled');
      case 'expired':
        return t('page.supporter.status_expired', 'Subscription expired');
      default:
        return t('page.supporter.status_inactive', 'Inactive supporter');
    }
  });
  const dateFmt = computed(
    () =>
      new Intl.DateTimeFormat(locale.value || 'en-US', {
        dateStyle: 'medium',
      })
  );
  const formattedExpiresAt = computed(() => {
    const raw = supporter.value?.expiresAt;
    if (!raw) return null;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return null;
    return dateFmt.value.format(new Date(ms));
  });
  const summaryText = computed(() => {
    if (!supporter.value) return '';
    if (!isActive.value) {
      return t(
        'page.supporter.status_summary_inactive',
        'Your support has lapsed. Pick a tier below to renew and re-enable your perks.'
      );
    }
    if (isSubscription.value) {
      if (supporter.value.status === 'cancelled' && formattedExpiresAt.value) {
        return t('page.supporter.status_summary_cancelled_until', {
          date: formattedExpiresAt.value,
        });
      }
      if (formattedExpiresAt.value) {
        return t('page.supporter.status_summary_renews', {
          date: formattedExpiresAt.value,
        });
      }
      return t(
        'page.supporter.status_summary_subscription',
        'Thanks for keeping the lights on. You can manage your billing details anytime.'
      );
    }
    if (formattedExpiresAt.value) {
      return t('page.supporter.status_summary_one_time_until', {
        date: formattedExpiresAt.value,
      });
    }
    return t('page.supporter.status_summary_one_time', 'Thanks for the one-time contribution.');
  });
  const bannerClasses = computed(() => {
    if (!isActive.value) {
      return 'border-warning-500/40 bg-warning-500/5';
    }
    switch (supporter.value?.tier) {
      case 'chad':
        return 'border-amber-400/40 bg-amber-500/5';
      case 'timmy':
        return 'border-primary-400/40 bg-primary-500/5';
      case 'scav':
        return 'border-surface-500/40 bg-surface-700/20';
      default:
        return 'border-success-500/40 bg-success-500/5';
    }
  });
  const iconWrapClasses = computed(() => {
    switch (supporter.value?.tier) {
      case 'chad':
        return 'border-amber-400 bg-gradient-to-br from-amber-500 to-amber-600';
      case 'timmy':
        return 'border-primary-400 bg-gradient-to-br from-primary-500 to-primary-600';
      case 'scav':
        return 'border-surface-500 bg-gradient-to-br from-surface-600 to-surface-700';
      default:
        return 'border-success-500 bg-success-600';
    }
  });
  async function handleManage() {
    if (portalLoading.value) return;
    portalLoading.value = true;
    portalError.value = null;
    try {
      const url = await openBillingPortal(window.location.href);
      if (url) {
        window.location.href = url;
        return;
      }
      portalError.value =
        composableError.value ||
        t('page.supporter.portal_error_generic', 'We could not open the billing portal.');
    } catch (err: unknown) {
      logger.error('SupporterStatusBanner: handleManage failed', err);
      portalError.value =
        err instanceof Error
          ? err.message
          : t('page.supporter.portal_error_generic', 'We could not open the billing portal.');
    } finally {
      portalLoading.value = false;
    }
  }
</script>
