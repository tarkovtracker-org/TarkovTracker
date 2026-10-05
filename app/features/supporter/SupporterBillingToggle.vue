<template>
  <!-- Below sm: a full-width three-column control with the discount on its own line. -->
  <div
    class="bg-surface-800/60 ring-surface-700/40 grid w-full grid-cols-3 gap-1 rounded-2xl p-1 ring-1 sm:flex sm:w-auto sm:items-center sm:justify-center sm:rounded-full"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :aria-pressed="modelValue === opt.value"
      class="relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-center text-sm font-medium transition-all duration-200 sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-4"
      :class="
        modelValue === opt.value
          ? 'bg-primary-600 text-white shadow-md'
          : 'text-surface-300 light:hover:text-surface-50 hover:text-white'
      "
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
      <span
        v-if="opt.discount"
        class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
        :class="
          modelValue === opt.value
            ? 'light:bg-surface-700/70 light:text-surface-50 bg-white/20 text-white'
            : 'bg-success-500/20 text-success-400 light:text-success-700'
        "
      >
        -{{ opt.discount }}%
      </span>
    </button>
  </div>
</template>
<script setup lang="ts">
  import { discountPercent } from '@/features/supporter/supporterPricing';
  import type { BillingInterval } from '@/features/supporter/supporterTypes';
  const { t } = useI18n({ useScope: 'global' });
  defineProps<{ modelValue: BillingInterval }>();
  const emit = defineEmits<{ 'update:modelValue': [BillingInterval] }>();
  const options = computed(() => [
    {
      value: 'monthly' as BillingInterval,
      label: t('page.supporter.billing_monthly'),
      discount: 0,
    },
    {
      value: '6month' as BillingInterval,
      label: t('page.supporter.billing_6month'),
      discount: discountPercent('6month'),
    },
    {
      value: 'yearly' as BillingInterval,
      label: t('page.supporter.billing_yearly'),
      discount: discountPercent('yearly'),
    },
  ]);
</script>
