<script setup lang="ts">
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const state = ref('none');
  const canCancel = ref(false);
  const busy = ref(false);
  const failed = ref(false);
  const description = computed(() => {
    if (state.value === 'cancelled') return t('settings.account_data.deletion_withdrawn');
    if (['requested', 'provider_wait'].includes(state.value))
      return t('settings.account_data.deletion_waiting');
    return t('settings.account_data.deletion_preparing');
  });
  const requestedAction = (cancel: boolean) => (cancel ? 'cancel' : 'status');
  const validateStatus = (data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('unavailable');
    if (!('state' in data)) throw new Error('unavailable');
    requireStateString(data.state);
  };
  const requireStateString = (state: unknown) => {
    if (typeof state !== 'string') throw new Error('unavailable');
  };
  const refresh = async (cancel = false) => {
    busy.value = true;
    failed.value = false;
    try {
      const result = await $supabase.client.functions.invoke('account-deletion-state', {
        body: { action: requestedAction(cancel) },
      });
      if (result.error) throw new Error('unavailable');
      validateStatus(result.data);
      state.value = result.data.state;
      canCancel.value = result.data.can_cancel === true;
    } catch {
      failed.value = true;
      canCancel.value = false;
    } finally {
      busy.value = false;
    }
  };
  onMounted(() => refresh());
</script>
<template>
  <section
    v-if="!['none', 'completed'].includes(state) || failed"
    class="mb-4 space-y-3"
    aria-live="polite"
  >
    <UAlert
      :title="t('settings.account_data.account_deletion_title')"
      :description="failed ? t('settings.account_data.deletion_status_unavailable') : description"
      color="warning"
      variant="soft"
    />
    <UButton :loading="busy" @click="refresh()">
      {{ t('settings.account_data.deletion_refresh') }}
    </UButton>
    <UButton v-if="canCancel" :disabled="busy" color="neutral" @click="refresh(true)">
      {{ t('settings.account_data.deletion_withdraw') }}
    </UButton>
  </section>
</template>
