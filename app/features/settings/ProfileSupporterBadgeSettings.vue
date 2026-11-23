<template>
  <div v-if="available" class="space-y-2">
    <USwitch
      :label="t('settings.profile_sharing.show_supporter_badge')"
      :description="t('settings.profile_sharing.show_supporter_badge_help')"
      :model-value="enabled"
      :disabled="disabled"
      :loading="saving"
      @update:model-value="save"
    />
    <div v-if="readFailed || saveFailed" class="space-y-1">
      <p class="text-error text-sm" role="alert">
        {{ t('settings.profile_sharing.supporter_badge_failed') }}
      </p>
      <UButton v-if="readFailed" size="xs" variant="soft" @click="retry++">
        {{ t('common.retry') }}
      </UButton>
    </div>
  </div>
</template>
<script setup lang="ts">
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
  watch(
    [userId, retry],
    async ([id], _previous, onCleanup) => {
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
        readFailed.value = Boolean(error);
        enabled.value = !error && data?.show_supporter_badge === true;
      } catch {
        if (current) readFailed.value = true;
      } finally {
        if (current) loading.value = false;
      }
    },
    { immediate: true }
  );
  const save = async (value: boolean) => {
    const id = userId.value;
    if (!id || disabled.value) return;
    saving.value = true;
    saveFailed.value = false;
    try {
      const { error } = await $supabase.client
        .from('user_preferences')
        .upsert(
          { user_id: id, show_supporter_badge: value },
          { onConflict: 'user_id', defaultToNull: false }
        );
      if (userId.value !== id) return;
      saveFailed.value = Boolean(error);
      if (!error) enabled.value = value;
    } catch {
      if (userId.value === id) saveFailed.value = true;
    } finally {
      if (userId.value === id) saving.value = false;
    }
  };
</script>
