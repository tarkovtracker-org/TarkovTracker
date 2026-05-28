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
      <SupporterStatusBanner />
      <div id="tiers" class="flex justify-center">
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
  import SupporterStatusBanner from '@/features/supporter/SupporterStatusBanner.vue';
  import SupporterTierCard from '@/features/supporter/SupporterTierCard.vue';
  import type { BillingInterval } from '@/features/supporter/supporterTypes';
  const { t } = useI18n({ useScope: 'global' });
  const route = useRoute();
  const router = useRouter();
  const toast = useToast();
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
  onMounted(() => {
    const thanks = route.query.thanks;
    if (typeof thanks === 'string' && thanks.length > 0) {
      const isOneTime = thanks === 'one_time';
      toast.add({
        title: isOneTime
          ? t('page.supporter.thanks_one_time_title', 'Thanks for your support!')
          : t('page.supporter.thanks_subscription_title', 'Welcome aboard!'),
        description: isOneTime
          ? t(
              'page.supporter.thanks_one_time_description',
              'Your contribution went through. It may take a moment to reflect on your account.'
            )
          : t(
              'page.supporter.thanks_subscription_description',
              'Your subscription is being activated. Your tier badge will appear shortly.'
            ),
        color: 'success',
        icon: 'i-mdi-heart',
      });
      const cleaned = { ...route.query };
      delete cleaned.thanks;
      void router.replace({ query: cleaned });
    }
  });
</script>
