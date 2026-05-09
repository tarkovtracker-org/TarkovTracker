<template>
  <div class="bg-surface-800/60 flex items-center justify-center gap-1 rounded-full p-1">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :aria-pressed="modelValue === opt.value"
      class="relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200"
      :class="
        modelValue === opt.value
          ? 'bg-primary-600 text-white shadow'
          : 'text-surface-300 hover:text-white'
      "
      @click="emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
      <span
        v-if="opt.discount"
        class="bg-success-500/20 text-success-400 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
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
