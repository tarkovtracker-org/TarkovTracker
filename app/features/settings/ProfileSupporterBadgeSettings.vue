<template>
  <div v-if="available" class="space-y-2">
    <USwitch
      :label="t('settings.profile_sharing.show_supporter_badge', 'Show my supporter badge')"
      :description="
        t(
          'settings.profile_sharing.show_supporter_badge_help',
          'Show your supporter or active subscriber badge on public profiles when Streamer Mode is off.'
        )
      "
      :model-value="enabled"
      :disabled="disabled"
      :loading="loading || saving"
      @update:model-value="save"
    />
    <div v-if="readFailed || saveFailed" class="space-y-1">
      <p class="text-error text-sm" role="alert">
        {{
          t(
            'settings.profile_sharing.supporter_badge_failed',
            'Unable to load or save your supporter badge setting. Try again.'
          )
        }}
      </p>
      <UButton v-if="readFailed" size="xs" variant="soft" @click="retry++">
        {{ t('common.retry', 'Retry') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const { isSupporter, loadedUserId } = useSupporter();
  const userId = computed(() => ($supabase.user.loggedIn ? $supabase.user.id : null));
  const eligible = computed(() => loadedUserId.value === userId.value && isSupporter.value);
  const enabled = ref(false);
  const available = computed(() => eligible.value || enabled.value);
  const loading = ref(false);
  const saving = ref(false);
  const readFailed = ref(false);
  const saveFailed = ref(false);
  const retry = ref(0);
  const disabled = computed(() => loading.value || saving.value || readFailed.value);
  const reportFailure = (action: 'load' | 'save', error: unknown) => {
    const code = error instanceof Error ? error.name : (error as { code?: string } | null)?.code;
    logger.warn(`[ProfileSupporterBadgeSettings] Failed to ${action} the supporter badge setting`, {
      code,
    });
  };
  let saveVersion = 0;
  watch(
    [userId, retry],
    async ([id], _previous, onCleanup) => {
      saveVersion += 1;
      let current = true;
      onCleanup(() => {
        current = false;
      });
      enabled.value = false;
      readFailed.value = false;
      saveFailed.value = false;
      loading.value = Boolean(id);
      saving.value = false;
      if (!id) return;
      try {
        const { data, error } = await $supabase.client
          .from('user_preferences')
          .select('show_supporter_badge')
          .eq('user_id', id)
          .maybeSingle();
        if (!current) return;
        if (error) throw error;
        enabled.value = data?.show_supporter_badge === true;
      } catch (error) {
        if (!current) return;
        reportFailure('load', error);
        readFailed.value = true;
      } finally {
        if (current) loading.value = false;
      }
    },
    { immediate: true, flush: 'sync' }
  );
  const save = async (value: boolean) => {
    const id = userId.value;
    if (!id || disabled.value) return;
    const version = ++saveVersion;
    saving.value = true;
    saveFailed.value = false;
    try {
      const { error } = await $supabase.client
        .from('user_preferences')
        .upsert(
          { user_id: id, show_supporter_badge: value },
          { onConflict: 'user_id', defaultToNull: false }
        );
      if (version !== saveVersion) return;
      if (error) throw error;
      enabled.value = value;
    } catch (error) {
      if (version !== saveVersion) return;
      reportFailure('save', error);
      saveFailed.value = true;
    } finally {
      if (version === saveVersion) saving.value = false;
    }
  };
</script>
