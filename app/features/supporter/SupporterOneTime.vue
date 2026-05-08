<template>
  <div class="border-surface-700/50 bg-surface-900/60 rounded-2xl border p-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 class="text-base font-bold text-white">
          {{ t('page.supporter.one_time_title') }}
        </h3>
        <p class="text-surface-400 mt-1 text-sm">
          {{ t('page.supporter.one_time_subtitle', { min: formattedOneTimeCharge }) }}
        </p>
        <p class="text-surface-500 mt-1 text-xs">
          {{ oneTimeBreakdown }}
        </p>
      </div>
      <UButton
        class="shrink-0 font-semibold"
        color="neutral"
        variant="soft"
        size="lg"
        :to="oneTimeUrl || undefined"
        :disabled="!oneTimeUrl"
        :external="!!oneTimeUrl"
        target="_blank"
        rel="noopener noreferrer"
        icon="i-mdi-heart-outline"
      >
        {{ t('page.supporter.one_time_cta') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { calcOneTimeCharge } from '@/features/supporter/supporterPricing';
  const { locale, t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
  const ONE_TIME_BASE = 3;
  const currencyFormatter = computed(
    () =>
      new Intl.NumberFormat(locale.value || 'en-US', {
        style: 'currency',
        currency: 'USD',
      })
  );
  const oneTimeCharge = computed(() => calcOneTimeCharge(ONE_TIME_BASE));
  const formattedOneTimeCharge = computed(() =>
    currencyFormatter.value.format(oneTimeCharge.value)
  );
  const oneTimeBreakdown = computed(() => {
    const base = currencyFormatter.value.format(ONE_TIME_BASE);
    const fees = currencyFormatter.value.format(oneTimeCharge.value - ONE_TIME_BASE);
    return t('page.supporter.one_time_breakdown', { base, fees });
  });
  const oneTimeUrl = computed<string>(
    () => (runtimeConfig.public.stripeOneTimeUrl as string) ?? ''
  );
</script>
