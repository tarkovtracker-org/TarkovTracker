<template>
  <div class="border-surface-700/50 bg-surface-900/60 rounded-2xl border p-6">
    <div class="flex flex-col gap-6 sm:flex-row sm:items-stretch sm:justify-between">
      <div class="flex flex-col sm:flex-1">
        <h3 class="text-base font-bold text-white">
          {{ t('page.supporter.one_time_title') }}
        </h3>
        <p class="text-surface-400 mt-1 text-sm">
          {{ t('page.supporter.one_time_subtitle', { min: formattedMinimum }) }}
        </p>
        <p class="text-surface-300 mt-4 text-xs font-semibold tracking-wide uppercase">
          {{ t('page.supporter.one_time_perks_heading', 'Includes supporter perks') }}
        </p>
        <ul class="mt-2 space-y-2">
          <li
            v-for="perk in perks"
            :key="perk.label"
            class="text-surface-300 flex items-start gap-2 text-sm"
          >
            <UIcon :name="perk.icon" class="text-success-500 mt-0.5 h-4 w-4 shrink-0" />
            {{ perk.label }}
          </li>
        </ul>
        <p class="text-surface-500 mt-4 text-xs">
          {{
            t(
              'page.supporter.one_time_fee_transparency',
              'Stripe fees (2.9% + $0.30) are shown before you pay.'
            )
          }}
        </p>
      </div>
      <div
        class="border-surface-700/50 bg-surface-800/40 flex w-full flex-col gap-4 rounded-xl border p-4 sm:w-64"
      >
        <div class="flex flex-col gap-1.5">
          <label :for="amountId" class="text-surface-300 text-xs font-semibold">
            {{ t('page.supporter.one_time_amount_field_label', 'Contribution amount') }}
          </label>
          <UInput
            :id="amountId"
            v-model="customAmount"
            type="text"
            inputmode="decimal"
            :aria-label="
              t('page.supporter.one_time_amount_label', 'One-time contribution amount in USD')
            "
            :aria-invalid="!!amountError"
            :aria-describedby="amountError ? amountErrorId : undefined"
            :placeholder="ONE_TIME_BASE.toFixed(2)"
            :color="amountError ? 'error' : 'neutral'"
            :highlight="!!amountError"
            size="lg"
            class="w-full"
            @blur="normalizeAmount"
          >
            <template #leading>
              <span class="text-surface-400 text-sm font-medium">$</span>
            </template>
          </UInput>
          <p v-if="amountError" :id="amountErrorId" class="text-error-500 text-xs">
            {{ amountError }}
          </p>
        </div>
        <label
          class="hover:border-surface-600 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-white/8 px-3 py-2 transition-colors"
        >
          <span class="flex flex-col">
            <span class="text-surface-200 text-xs font-semibold">
              {{ t('page.supporter.one_time_cover_fees', 'Cover Stripe fees') }}
            </span>
            <span class="text-surface-500 text-[11px]">
              {{ t('page.supporter.one_time_fee_amount', { fees: formattedFee }) }}
            </span>
          </span>
          <USwitch v-model="coverFees" size="sm" />
        </label>
        <UButton
          v-if="authResolved && !currentUserId"
          block
          class="font-semibold"
          color="primary"
          variant="solid"
          size="lg"
          icon="i-mdi-login"
          :to="loginLink"
        >
          {{ t('page.supporter.one_time_login_cta', 'Log in to contribute') }}
        </UButton>
        <UButton
          v-else
          block
          class="font-semibold"
          color="neutral"
          variant="soft"
          size="lg"
          :loading="checkoutLoading"
          :disabled="!isValid"
          icon="i-mdi-heart-outline"
          @click="handleCheckout"
        >
          {{ t('page.supporter.one_time_give_cta', { total: formattedOneTimeCharge }) }}
        </UButton>
        <p v-if="authResolved && !currentUserId" class="text-warning-400 text-center text-[11px]">
          {{ t('page.supporter.login_required_warning') }}
        </p>
        <p v-else class="text-surface-500 text-center text-[11px]">
          {{ t('page.supporter.one_time_net_note', { net: formattedNet }) }}
        </p>
      </div>
    </div>
    <UAlert
      v-if="checkoutError"
      class="mt-4"
      color="error"
      variant="soft"
      icon="i-mdi-alert-circle-outline"
      :title="t('page.supporter.checkout_error_title', 'Checkout failed')"
      :description="checkoutError"
      :close="true"
      @update:open="checkoutError = null"
    />
  </div>
</template>
<script setup lang="ts">
  import {
    calcOneTimeCharge,
    calcStripeFee,
    parseContributionAmount,
  } from '@/features/supporter/supporterPricing';
  import { logger } from '@/utils/logger';
  const { locale, t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const { createCheckout, error: composableError } = useSupporter();
  const ONE_TIME_BASE = 3;
  const ONE_TIME_MAX = 500;
  const amountId = useId();
  const amountErrorId = useId();
  const customAmount = ref<string>(ONE_TIME_BASE.toFixed(2));
  const amountTouched = ref(false);
  const coverFees = ref(true);
  const checkoutLoading = ref(false);
  const checkoutError = ref<string | null>(null);
  const currentUserId = ref<string | null>(null);
  const authResolved = ref(false);
  const loginLink = '/login?redirect=/supporter';
  onMounted(async () => {
    try {
      const { data } = await $supabase.client.auth.getUser();
      currentUserId.value = data?.user?.id ?? null;
    } catch (err) {
      logger.error('SupporterOneTime: failed to load auth user', err);
      currentUserId.value = null;
    } finally {
      authResolved.value = true;
    }
  });
  const numericAmount = computed(() => parseContributionAmount(customAmount.value));
  function normalizeAmount() {
    amountTouched.value = true;
    if (numericAmount.value > 0) {
      customAmount.value = numericAmount.value.toFixed(2);
    }
  }
  const amountError = computed(() => {
    if (!amountTouched.value) return null;
    if (!Number.isFinite(numericAmount.value)) {
      return t('page.supporter.one_time_invalid_error', 'Enter a valid amount');
    }
    if (numericAmount.value < ONE_TIME_BASE) {
      return t('page.supporter.one_time_min_error', { min: formattedMinimum.value });
    }
    if (numericAmount.value > ONE_TIME_MAX) {
      return t('page.supporter.one_time_max_error', { max: formattedMaximum.value });
    }
    return null;
  });
  const isValid = computed(
    () =>
      numericAmount.value >= ONE_TIME_BASE &&
      numericAmount.value <= ONE_TIME_MAX &&
      !!currentUserId.value
  );
  const currencyFormatter = computed(
    () =>
      new Intl.NumberFormat(locale.value || 'en-US', {
        style: 'currency',
        currency: 'USD',
      })
  );
  const formattedMinimum = computed(() => currencyFormatter.value.format(ONE_TIME_BASE));
  const formattedMaximum = computed(() => currencyFormatter.value.format(ONE_TIME_MAX));
  const perks = computed(() => [
    { icon: 'i-mdi-shield-star-outline', label: t('page.supporter.perk_badge') },
    { icon: 'i-mdi-discord', label: t('page.supporter.perk_discord') },
    {
      icon: 'i-mdi-calendar-clock',
      label: t('page.supporter.perk_data_retention', 'Extended inactive account retention'),
    },
  ]);
  const baseAmount = computed(() => numericAmount.value || ONE_TIME_BASE);
  const chargeAmount = computed(() =>
    coverFees.value ? calcOneTimeCharge(baseAmount.value) : baseAmount.value
  );
  const feeAmount = computed(() => calcStripeFee(chargeAmount.value));
  const netAmount = computed(() => chargeAmount.value - feeAmount.value);
  const formattedOneTimeCharge = computed(() => currencyFormatter.value.format(chargeAmount.value));
  const formattedFee = computed(() => currencyFormatter.value.format(feeAmount.value));
  const formattedNet = computed(() => currencyFormatter.value.format(netAmount.value));
  async function handleCheckout() {
    if (!isValid.value || !currentUserId.value) return;
    checkoutLoading.value = true;
    checkoutError.value = null;
    try {
      const url = await createCheckout({
        mode: 'payment',
        amount: chargeAmount.value,
      });
      if (url) {
        window.location.href = url;
        return;
      }
      checkoutError.value =
        composableError.value || t('page.supporter.checkout_error_generic', 'Checkout failed');
    } catch (e: unknown) {
      logger.error('SupporterOneTime: handleCheckout failed', {
        userId: currentUserId.value,
        amount: numericAmount.value,
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
</script>
