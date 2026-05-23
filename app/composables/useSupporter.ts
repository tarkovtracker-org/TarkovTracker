import type { RealtimeChannel } from '@supabase/supabase-js';
export interface SupporterStatus {
  tier: 'supporter' | 'scav' | 'timmy' | 'chad';
  status: 'active' | 'past_due' | 'expired' | 'cancelled';
  type: 'one_time' | 'subscription';
  hasEverSupported: boolean;
  expiresAt: string | null;
  startedAt: string;
}
const supporterState = ref<SupporterStatus | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
export function useSupporter() {
  const { $supabase } = useNuxtApp();
  let channel: RealtimeChannel | null = null;
  const isSupporter = computed(() => supporterState.value?.hasEverSupported === true);
  const isActiveSubscriber = computed(
    () =>
      supporterState.value?.type === 'subscription' &&
      (supporterState.value?.status === 'active' || supporterState.value?.status === 'past_due')
  );
  const activeTier = computed(() => {
    if (!supporterState.value) return null;
    if (supporterState.value.status === 'active' || supporterState.value.status === 'past_due') {
      return supporterState.value.tier;
    }
    if (supporterState.value.hasEverSupported) return 'supporter';
    return null;
  });
  const badgeLabel = computed(() => {
    const tier = activeTier.value;
    if (!tier) return null;
    if (tier === 'supporter') return 'Supporter';
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  });
  async function fetchStatus(userId: string) {
    if (!$supabase || !userId) return;
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await $supabase.client
        .from('supporters')
        .select('tier, status, type, has_ever_supported, expires_at, started_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (err) {
        error.value = err.message;
        return;
      }
      if (data) {
        supporterState.value = {
          tier: data.tier,
          status: data.status,
          type: data.type,
          hasEverSupported: data.has_ever_supported,
          expiresAt: data.expires_at,
          startedAt: data.started_at,
        };
      } else {
        supporterState.value = null;
      }
    } finally {
      loading.value = false;
    }
  }
  function subscribe(userId: string) {
    if (!$supabase || !userId) return;
    channel = $supabase.client
      .channel(`supporters:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supporters',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchStatus(userId);
        }
      )
      .subscribe();
  }
  function unsubscribe() {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }
  }
  async function createCheckout(params: {
    mode: 'payment' | 'subscription';
    userId: string;
    tier?: string;
    interval?: string;
    amount?: number;
  }): Promise<string | null> {
    try {
      const { url } = await $fetch<{ url: string }>('/api/stripe/checkout', {
        method: 'POST',
        body: params,
      });
      return url;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Checkout failed';
      error.value = message;
      return null;
    }
  }
  return {
    supporter: supporterState,
    loading,
    error,
    isSupporter,
    isActiveSubscriber,
    activeTier,
    badgeLabel,
    fetchStatus,
    subscribe,
    unsubscribe,
    createCheckout,
  };
}
