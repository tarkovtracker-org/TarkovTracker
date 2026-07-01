<template>
  <div
    class="relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-200"
    :class="
      tier.featured
        ? 'border-primary-500/60 bg-surface-800/80 shadow-[0_0_30px_rgba(var(--color-primary-500)/0.15)]'
        : 'border-surface-700/50 bg-surface-900/60 hover:border-surface-600/60'
    "
  >
    <div
      v-if="isCurrentTier"
      class="bg-success-600 py-1 text-center text-xs font-semibold tracking-wider text-white uppercase"
    >
      {{ t('page.supporter.current_tier_badge', 'Current tier') }}
    </div>
    <div
      v-else-if="tier.featured"
      class="bg-primary-600 py-1 text-center text-xs font-semibold tracking-wider text-white uppercase"
    >
      {{ t('page.supporter.most_popular') }}
    </div>
    <div class="flex flex-1 flex-col gap-5 p-6">
      <div>
        <h3 class="text-lg font-bold text-white uppercase">
          {{ t(`page.supporter.tier_${tier.id}_name`) }}
        </h3>
        <p class="text-surface-400 mt-0.5 text-sm">
          {{ t(`page.supporter.tier_${tier.id}_tagline`) }}
        </p>
      </div>
      <div>
        <div class="flex items-end gap-1">
          <span class="text-4xl font-bold tracking-tight text-white">
            {{ formattedMonthlyCharge }}
          </span>
          <span class="text-surface-400 mb-1 text-sm">
            {{ t('page.supporter.price_per_month_suffix', '/mo') }}
          </span>
        </div>
        <dl
          class="border-surface-700/50 bg-surface-800/40 mt-3 space-y-1.5 rounded-xl border px-3.5 py-3 text-sm"
        >
          <div
            v-if="interval !== 'monthly'"
            class="border-surface-700/50 flex items-center justify-between gap-2 border-b pb-1.5"
          >
            <dt class="text-surface-300">{{ billedLabel }}</dt>
            <dd class="font-semibold text-white">{{ formattedChargeTotal }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-surface-400 text-xs">
              {{ t('page.supporter.price_to_us', 'Goes to us') }}
            </dt>
            <dd class="text-surface-200 text-xs font-medium">{{ formattedToUs }}</dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="text-surface-400 text-xs">
              {{ t('page.supporter.price_stripe_fees', 'Stripe fees') }}
            </dt>
            <dd class="text-surface-200 text-xs font-medium">{{ formattedFees }}</dd>
          </div>
        </dl>
        <p
          v-if="savings > 0"
          class="text-success-400 mt-2 flex items-center gap-1.5 text-xs font-medium"
        >
          <UIcon name="i-mdi-tag-outline" class="h-3.5 w-3.5 shrink-0" />
          {{ savingsNote }}
        </p>
      </div>
      <ul class="flex-1 space-y-2">
        <li
          v-for="perk in perks"
          :key="perk"
          class="text-surface-300 flex items-start gap-2 text-sm"
        >
          <UIcon
            name="i-mdi-check-circle-outline"
            class="text-success-500 mt-0.5 h-4 w-4 shrink-0"
          />
          {{ perk }}
        </li>
      </ul>
      <UAlert
        v-if="checkoutError"
        color="error"
        variant="soft"
        icon="i-mdi-alert-circle-outline"
        :title="t('page.supporter.checkout_error_title', 'Checkout failed')"
        :description="checkoutError"
        :close="true"
        @update:open="checkoutError = null"
      />
      <UButton
        v-if="isCurrentTier"
        class="w-full justify-center font-semibold"
        color="primary"
        variant="soft"
        size="lg"
        :loading="manageLoading"
        icon="i-mdi-credit-card-outline"
        @click="handleManage"
      >
        {{ t('page.supporter.manage_subscription_cta', 'Manage subscription') }}
      </UButton>
      <UButton
        v-else-if="authResolved && !currentUserId"
        class="w-full justify-center font-semibold"
        :color="tier.featured ? 'primary' : 'neutral'"
        :variant="tier.featured ? 'solid' : 'soft'"
        size="lg"
        icon="i-mdi-login"
        :to="loginLink"
      >
        {{ t('page.supporter.tier_login_cta', 'Log in to subscribe') }}
      </UButton>
      <UButton
        v-else
        class="w-full justify-center font-semibold"
        :color="tier.featured ? 'primary' : 'neutral'"
        :variant="tier.featured ? 'solid' : 'soft'"
        size="lg"
        :loading="checkoutLoading || !authResolved"
        :disabled="!authResolved"
        @click="handleCheckout"
      >
        {{
          isActiveSubscriber
            ? t('page.supporter.tier_change_cta', 'Switch to this tier')
            : t('page.supporter.tier_cta')
        }}
      </UButton>
      <p v-if="authResolved && !currentUserId" class="text-warning-400 text-center text-xs">
        {{
          t(
            'page.supporter.login_required_warning',
            'You must be logged in to receive supporter perks.'
          )
        }}
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    calcBaseMonthly,
    calcIntervalMonths,
    calcSubscriptionCharge,
  } from '@/features/supporter/supporterPricing';
  import { logger } from '@/utils/logger';
  import type { BillingInterval, SupporterTier } from '@/features/supporter/supporterTypes';
  const props = defineProps<{
    tier: SupporterTier;
    interval: BillingInterval;
  }>();
  const { locale, t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const {
    activeTier,
    isActiveSubscriber,
    openBillingPortal,
    createCheckout,
    error: composableError,
  } = useSupporter();
  const checkoutLoading = ref(false);
  const checkoutError = ref<string | null>(null);
  const manageLoading = ref(false);
  const currentUserId = ref<string | null>(null);
  const authResolved = ref(false);
  const loginLink = '/login?redirect=/supporter';
  const isCurrentTier = computed(
    () => isActiveSubscriber.value && activeTier.value === props.tier.id
  );
  onMounted(async () => {
    try {
      const { data } = await $supabase.client.auth.getUser();
      currentUserId.value = data?.user?.id ?? null;
    } catch (err) {
      logger.error('SupporterTierCard: failed to load auth user', err);
      currentUserId.value = null;
    } finally {
      authResolved.value = true;
    }
  });
  const fmt = computed(
    () =>
      new Intl.NumberFormat(locale.value || 'en-US', {
        style: 'currency',
        currency: 'USD',
      })
  );
  const chargeTotal = computed(() =>
    calcSubscriptionCharge(props.tier.baseMonthly, props.interval)
  );
  const baseMonthly = computed(() => calcBaseMonthly(props.tier.baseMonthly, props.interval));
  const months = computed(() => calcIntervalMonths(props.interval));
  const monthlyCharge = computed(() => chargeTotal.value / months.value);
  const formattedMonthlyCharge = computed(() => fmt.value.format(monthlyCharge.value));
  const periodBase = computed(() => baseMonthly.value * months.value);
  const intervalLabel = computed(() =>
    props.interval === '6month'
      ? t('page.supporter.billing_6month_interval', '6 months')
      : t('page.supporter.billing_yearly_interval', 'year')
  );
  const formattedChargeTotal = computed(() => fmt.value.format(chargeTotal.value));
  const formattedToUs = computed(() => fmt.value.format(periodBase.value));
  const formattedFees = computed(() => {
    const fees = chargeTotal.value - periodBase.value;
    return fmt.value.format(Math.abs(fees) < 0.005 ? 0 : fees);
  });
  const billedLabel = computed(() =>
    t('page.supporter.billed_every_label', { label: intervalLabel.value })
  );
  const savings = computed(() => {
    if (props.interval === 'monthly') return 0;
    const monthlyEquivalent = calcSubscriptionCharge(props.tier.baseMonthly, 'monthly');
    return Math.max(0, monthlyEquivalent * months.value - chargeTotal.value);
  });
  const savingsNote = computed(() =>
    t('page.supporter.savings_note', { amount: fmt.value.format(savings.value) })
  );
  async function handleCheckout() {
    if (!currentUserId.value) return;
    checkoutLoading.value = true;
    checkoutError.value = null;
    try {
      const url = await createCheckout({
        mode: 'subscription',
        tier: props.tier.id,
        interval: props.interval,
      });
      if (url) {
        window.location.href = url;
        return;
      }
      checkoutError.value =
        composableError.value || t('page.supporter.checkout_error_generic', 'Checkout failed');
    } catch (e: unknown) {
      logger.error('SupporterTierCard: handleCheckout failed', {
        userId: currentUserId.value,
        tier: props.tier.id,
        interval: props.interval,
        err: e,
      });
      checkoutError.value =
        e instanceof Error
          ? e.message
          : t('page.supporter.checkout_error_generic', 'Checkout failed');
    } finally {
      checkoutLoading.value = false;
    }
  }
  async function handleManage() {
    if (manageLoading.value) return;
    manageLoading.value = true;
    checkoutError.value = null;
    try {
      const url = await openBillingPortal(window.location.href);
      if (url) {
        window.location.href = url;
        return;
      }
      checkoutError.value =
        composableError.value ||
        t('page.supporter.portal_error_generic', 'We could not open the billing portal.');
    } catch (e: unknown) {
      logger.error('SupporterTierCard: handleManage failed', {
        userId: currentUserId.value,
        tier: props.tier.id,
        err: e,
      });
      checkoutError.value =
        e instanceof Error
          ? e.message
          : t('page.supporter.portal_error_generic', 'We could not open the billing portal.');
    } finally {
      manageLoading.value = false;
    }
  }
  const perks = computed(() => {
    const base = [
      t('page.supporter.perk_badge'),
      t('page.supporter.perk_discord'),
      t('page.supporter.perk_tier_role', { tier: t(`page.supporter.tier_${props.tier.id}_name`) }),
      t('page.supporter.perk_api_rate_limit', 'Higher API rate limits'),
      t('page.supporter.perk_data_retention', 'Extended inactive account retention'),
      t('page.supporter.perk_early_access'),
    ];
    if (props.tier.id === 'timmy' || props.tier.id === 'chad') {
      base.push(t('page.supporter.perk_priority_support'));
    }
    if (props.tier.id === 'chad') {
      base.push(t('page.supporter.perk_feature_voting'));
    }
    return base;
  });
</script>
