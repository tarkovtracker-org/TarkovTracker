<template>
  <div class="min-h-[calc(100vh-250px)] px-3 py-6 sm:px-6">
    <div class="mx-auto max-w-[1100px] space-y-8">
      <header class="text-center">
        <h1 class="text-2xl font-bold text-white sm:text-3xl">
          {{ t('page.supporter.title') }}
        </h1>
        <p class="text-surface-400 mx-auto mt-2 max-w-xl text-sm">
          {{ t('page.supporter.subtitle') }}
        </p>
      </header>
      <div class="flex justify-center">
        <SupporterBillingToggle v-model="interval" />
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SupporterTierCard v-for="tier in TIERS" :key="tier.id" :tier="tier" :interval="interval" />
      </div>
      <UAlert
        icon="i-mdi-information-outline"
        color="info"
        variant="soft"
        :title="t('page.supporter.transparency_note')"
        :description="t('page.supporter.transparency_detail')"
      />
      <SupporterOneTime />
      <SupporterAltPayments />
    </div>
  </div>
</template>
<script setup lang="ts">
  import SupporterAltPayments from '@/features/supporter/SupporterAltPayments.vue';
  import SupporterBillingToggle from '@/features/supporter/SupporterBillingToggle.vue';
  import SupporterOneTime from '@/features/supporter/SupporterOneTime.vue';
  import { TIERS } from '@/features/supporter/supporterPricing';
  import SupporterTierCard from '@/features/supporter/SupporterTierCard.vue';
  import type { BillingInterval } from '@/features/supporter/supporterTypes';
  const { t } = useI18n({ useScope: 'global' });
  definePageMeta({ layout: 'default' });
  useHead({
    title: () => t('page.supporter.title'),
    meta: [
      { name: 'description', content: () => t('page.supporter.subtitle') },
      { property: 'og:title', content: () => t('page.supporter.title') },
      { property: 'og:description', content: () => t('page.supporter.subtitle') },
    ],
  });
  const interval = ref<BillingInterval>('monthly');
</script>
