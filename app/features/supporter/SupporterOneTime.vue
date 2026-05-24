<template>
  <div class="border-surface-700/50 bg-surface-900/60 rounded-2xl border p-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="text-base font-bold text-white">
          {{ t('page.supporter.one_time_title') }}
        </h3>
        <p class="text-surface-400 mt-1 text-sm">
          {{ t('page.supporter.one_time_subtitle', { min: formattedMinimum }) }}
        </p>
        <p class="text-surface-500 mt-1 text-xs">
          {{ oneTimeBreakdown }}
        </p>
        <p v-if="!currentUserId" class="text-warning-400 mt-1 text-xs">
          {{ t('page.supporter.login_required_warning') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UInput
          v-model="customAmount"
          type="number"
          :aria-label="
            t('page.supporter.one_time_amount_label', 'One-time contribution amount in USD')
          "
          :min="ONE_TIME_BASE"
          step="1"
          :placeholder="String(ONE_TIME_BASE)"
          class="w-24"
          size="lg"
        />
        <UButton
          class="shrink-0 font-semibold"
          color="neutral"
          variant="soft"
          size="lg"
          :loading="checkoutLoading"
          :disabled="!isValid"
          icon="i-mdi-heart-outline"
          @click="handleCheckout"
        >
          {{ t('page.supporter.one_time_cta') }}
        </UButton>
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
  import { calcOneTimeCharge } from '@/features/supporter/supporterPricing';
  import { logger } from '@/utils/logger';
  const { locale, t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const { createCheckout, error: composableError } = useSupporter();
  const ONE_TIME_BASE = 3;
  const customAmount = ref<string>(String(ONE_TIME_BASE));
  const checkoutLoading = ref(false);
  const checkoutError = ref<string | null>(null);
  const currentUserId = ref<string | null>(null);
  onMounted(async () => {
    try {
      const { data } = await $supabase.client.auth.getUser();
      currentUserId.value = data?.user?.id ?? null;
    } catch (err) {
      logger.error('SupporterOneTime: failed to load auth user', err);
      currentUserId.value = null;
    }
  });
  const numericAmount = computed(() => {
    const val = Number(customAmount.value);
    return Number.isFinite(val) ? val : 0;
  });
  const isValid = computed(() => numericAmount.value >= ONE_TIME_BASE && !!currentUserId.value);
  const currencyFormatter = computed(
    () =>
      new Intl.NumberFormat(locale.value || 'en-US', {
        style: 'currency',
        currency: 'USD',
      })
  );
  const formattedMinimum = computed(() => currencyFormatter.value.format(ONE_TIME_BASE));
  const oneTimeCharge = computed(() => calcOneTimeCharge(numericAmount.value || ONE_TIME_BASE));
  const oneTimeBreakdown = computed(() => {
    const base = currencyFormatter.value.format(numericAmount.value || ONE_TIME_BASE);
    const fees = currencyFormatter.value.format(
      oneTimeCharge.value - (numericAmount.value || ONE_TIME_BASE)
    );
    return t('page.supporter.one_time_breakdown', { base, fees });
  });
  async function handleCheckout() {
    if (!isValid.value || !currentUserId.value) return;
    checkoutLoading.value = true;
    checkoutError.value = null;
    try {
      const url = await createCheckout({
        mode: 'payment',
        amount: oneTimeCharge.value,
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
