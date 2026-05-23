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
  </div>
</template>
<script setup lang="ts">
  import { calcOneTimeCharge } from '@/features/supporter/supporterPricing';
  const { locale, t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const { createCheckout } = useSupporter();
  const ONE_TIME_BASE = 3;
  const customAmount = ref<string>(String(ONE_TIME_BASE));
  const checkoutLoading = ref(false);
  const currentUserId = ref<string | null>(null);
  onMounted(async () => {
    const { data } = await $supabase.client.auth.getUser();
    currentUserId.value = data?.user?.id ?? null;
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
    try {
      const url = await createCheckout({
        mode: 'payment',
        userId: currentUserId.value,
        amount: oneTimeCharge.value,
      });
      if (url) {
        window.location.href = url;
      }
    } finally {
      checkoutLoading.value = false;
    }
  }
</script>
