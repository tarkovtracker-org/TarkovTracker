<template>
  <div class="space-y-8">
    <SupporterStatusBanner />
    <div id="tiers" class="flex justify-center">
      <SupporterBillingToggle v-model="interval" />
    </div>
    <p class="text-surface-400 text-center text-sm">
      {{ t('page.supporter.billing_summary') }}
    </p>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <SupporterTierCard v-for="tier in TIERS" :key="tier.id" :tier="tier" :interval="interval" />
    </div>
    <SupporterOneTime />
    <SupporterAltPayments />
  </div>
</template>
<script setup lang="ts">
  import { useSupporter } from '@/composables/useSupporter';
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
  const { $supabase } = useNuxtApp();
  const { fetchStatus } = useSupporter();
  const interval = ref<BillingInterval>('monthly');
  let returnRefreshTimeout: number | undefined;
  const refreshSupporterStatus = () => {
    const userId = $supabase.user?.id;
    if (userId) void fetchStatus(userId);
  };
  const refreshSupporterStatusAfterReturn = () => {
    if (!$supabase.user?.id) return;
    refreshSupporterStatus();
    returnRefreshTimeout = window.setTimeout(refreshSupporterStatus, 3000);
  };
  onBeforeUnmount(() => {
    window.clearTimeout(returnRefreshTimeout);
  });
  const showThanks = (isOneTime: boolean) => {
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
  };
  onMounted(() => {
    const thanks = route.query.thanks;
    if (typeof thanks !== 'string' || thanks.length === 0) return;
    showThanks(thanks === 'one_time');
    // Stripe webhook may lag a moment behind the redirect. Realtime keeps the
    // banner fresh, but explicitly polling once on arrival makes the UI feel
    // immediate when the webhook lands quickly.
    refreshSupporterStatusAfterReturn();
    const cleaned = { ...route.query };
    delete cleaned.thanks;
    void router.replace({ query: cleaned });
  });
</script>
