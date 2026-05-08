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
      v-if="tier.featured"
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
          <span class="text-3xl font-bold text-white">{{ formattedMonthlyCharge }}</span>
          <span class="text-surface-400 mb-1 text-sm">/mo</span>
        </div>
        <p class="text-surface-500 mt-1 text-xs">
          {{ priceBreakdown }}
        </p>
        <p v-if="interval !== 'monthly'" class="text-surface-500 mt-0.5 text-xs">
          {{ billedNote }}
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
      <UButton
        class="w-full justify-center font-semibold"
        :color="tier.featured ? 'primary' : 'neutral'"
        :variant="tier.featured ? 'solid' : 'soft'"
        size="lg"
        :to="ctaUrl || undefined"
        :disabled="!ctaUrl"
        :external="!!ctaUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('page.supporter.tier_cta') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import {
    calcBaseMonthly,
    calcIntervalMonths,
    calcSubscriptionCharge,
  } from '@/features/supporter/supporterPricing';
  import type { BillingInterval, SupporterTier } from '@/features/supporter/supporterTypes';
  const props = defineProps<{
    tier: SupporterTier;
    interval: BillingInterval;
  }>();
  const { locale, t } = useI18n({ useScope: 'global' });
  const runtimeConfig = useRuntimeConfig();
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
  const priceBreakdown = computed(() => {
    const base = fmt.value.format(baseMonthly.value);
    const fees = fmt.value.format(monthlyCharge.value - baseMonthly.value);
    return t('page.supporter.price_breakdown', { base, fees });
  });
  const billedNote = computed(() => {
    const total = fmt.value.format(chargeTotal.value);
    const label =
      props.interval === '6month'
        ? t('page.supporter.billing_6month').toLowerCase()
        : t('page.supporter.billing_yearly').toLowerCase();
    return t('page.supporter.billed_note', { total, label });
  });
  const ctaUrl = computed<string>(() => {
    const tierId = props.tier.id.charAt(0).toUpperCase() + props.tier.id.slice(1);
    const intId = props.interval.charAt(0).toUpperCase() + props.interval.slice(1);
    const key = `stripe${tierId}${intId}Url` as keyof typeof runtimeConfig.public;
    return (runtimeConfig.public[key] as string) ?? '';
  });
  const perks = computed(() => {
    const base = [
      t('page.supporter.perk_badge'),
      t('page.supporter.perk_discord'),
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
