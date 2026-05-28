<script setup lang="ts">
  import { useSupporter } from '@/composables/useSupporter';
  import { useSystemStoreWithSupabase } from '@/stores/useSystemStore';
  const { $supabase } = useNuxtApp();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const { fetchStatus } = useSupporter();
  const { systemStore } = useSystemStoreWithSupabase();
  type SupporterTier = 'supporter' | 'scav' | 'timmy' | 'chad';
  const targetUserId = ref($supabase.user?.id ?? '');
  const tier = ref<SupporterTier>('chad');
  const enabled = ref(true);
  const isSaving = ref(false);
  const tierOptions = computed<Array<{ label: string; value: SupporterTier }>>(() => [
    { label: t('admin.supporter_tier_supporter'), value: 'supporter' },
    { label: t('admin.supporter_tier_scav'), value: 'scav' },
    { label: t('admin.supporter_tier_timmy'), value: 'timmy' },
    { label: t('admin.supporter_tier_chad'), value: 'chad' },
  ]);
  const canSave = computed(() => {
    return systemStore.isAdmin && targetUserId.value.trim().length > 0 && !isSaving.value;
  });
  const applySupporterOverride = async () => {
    if (!canSave.value) return;
    isSaving.value = true;
    try {
      const sessionResp = await $supabase.client.auth.getSession();
      let token = sessionResp.data.session?.access_token ?? null;
      if (!token) {
        const refreshed = await $supabase.client.auth.refreshSession();
        token = refreshed.data.session?.access_token ?? null;
      }
      if (!token) {
        throw new Error(t('admin.supporter_override_login_required'));
      }
      await $fetch('/api/admin/supporter', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          enabled: enabled.value,
          targetUserId: targetUserId.value.trim(),
          tier: tier.value,
        },
      });
      if (targetUserId.value.trim() === $supabase.user?.id) {
        await fetchStatus(targetUserId.value.trim());
      }
      toast.add({
        title: t('admin.supporter_override_saved_title'),
        description: enabled.value
          ? t('admin.supporter_override_enabled_description', { tier: tier.value })
          : t('admin.supporter_override_disabled_description'),
        color: 'success',
        icon: 'i-mdi-check-circle',
      });
    } catch (error) {
      toast.add({
        title: t('admin.supporter_override_failed_title'),
        description:
          error instanceof Error ? error.message : t('admin.supporter_override_failed_description'),
        color: 'error',
        icon: 'i-mdi-alert-circle',
      });
    } finally {
      isSaving.value = false;
    }
  };
</script>
<template>
  <GenericCard
    icon="i-mdi-credit-card-check"
    icon-color="success"
    highlight-color="primary"
    :fill-height="false"
    :title="t('admin.supporter_override_title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-4 px-4 py-4">
        <p class="text-surface-300 text-sm">
          {{ t('admin.supporter_override_description') }}
        </p>
        <UFormField name="targetUserId" :label="t('admin.supporter_target_user_label')">
          <UInput
            v-model="targetUserId"
            class="w-full"
            :placeholder="t('admin.supporter_target_user_placeholder')"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="supporterTier" :label="t('admin.supporter_tier_label')">
            <SelectMenuFixed v-model="tier" :items="tierOptions" value-key="value" />
          </UFormField>
          <div class="flex items-end">
            <USwitch
              v-model="enabled"
              :label="
                enabled ? t('admin.supporter_enabled_label') : t('admin.supporter_disabled_label')
              "
            />
          </div>
        </div>
        <div class="flex justify-end">
          <UButton
            color="primary"
            icon="i-mdi-content-save"
            :disabled="!canSave"
            :loading="isSaving"
            @click="applySupporterOverride"
          >
            {{ t('admin.supporter_override_save_button') }}
          </UButton>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
