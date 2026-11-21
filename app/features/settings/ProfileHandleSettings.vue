<template>
  <div v-if="streamerMode" class="text-surface-400 text-sm">
    {{ t('settings.profile_sharing.handle_streamer') }}
  </div>
  <div v-else-if="handle && !editingHandle" class="space-y-2">
    <p class="text-sm font-medium">{{ t('settings.profile_sharing.handle_label') }}</p>
    <a v-if="hasPublicMode" :href="handleUrl" class="text-info-300 mr-2 text-sm break-all">
      {{ handleUrl }}
    </a>
    <span v-else class="text-surface-400 text-sm">@{{ handle }}</span>
    <UButton v-if="hasPublicMode" size="xs" variant="soft" @click="copyToClipboard(handleUrl)">
      {{ t('page.profile.copy_profile_link') }}
    </UButton>
    <UButton size="xs" variant="soft" @click="editHandle">
      {{ t('settings.profile_sharing.handle_change') }}
    </UButton>
  </div>
  <div v-else-if="handleFailed" class="space-y-2">
    <p class="text-surface-400 text-sm">{{ t('settings.profile_sharing.handle_failed') }}</p>
    <UButton size="xs" variant="soft" @click="retry">{{ t('common.retry') }}</UButton>
  </div>
  <form v-else-if="!handleLoading" class="space-y-2" @submit.prevent="saveHandle">
    <UFormField
      :label="t('settings.profile_sharing.handle_label')"
      :help="
        t(
          handle
            ? 'settings.profile_sharing.handle_rename_help'
            : 'settings.profile_sharing.handle_help'
        )
      "
      :error="handleError || undefined"
    >
      <div class="flex flex-wrap gap-2">
        <UInput
          v-model="handleInput"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          :maxlength="24"
          :disabled="savingHandle"
          :placeholder="t('settings.profile_sharing.handle_placeholder')"
          @update:model-value="handleError = ''"
        />
        <UButton type="submit" :loading="savingHandle">
          {{
            handle
              ? t('settings.profile_sharing.handle_save')
              : t('settings.profile_sharing.handle_claim')
          }}
        </UButton>
        <UButton v-if="handle" variant="soft" :disabled="savingHandle" @click="resetHandleForm">
          {{ t('common.cancel') }}
        </UButton>
      </div>
    </UFormField>
    <UButton
      v-if="!handle && pmcSuggestion && !handleInput"
      size="xs"
      variant="soft"
      @click="handleInput = pmcSuggestion"
    >
      {{ t('settings.profile_sharing.handle_use_pmc', { handle: pmcSuggestion }) }}
    </UButton>
  </form>
</template>
<script setup lang="ts">
  import { isProfileHandle, profileHandlePath } from '@/utils/profileHandle';
  const { t } = useI18n({ useScope: 'global' });
  const { copyToClipboard } = useCopyToClipboard();
  const preferencesStore = usePreferencesStore();
  const streamerMode = computed(() => preferencesStore.getStreamerMode);
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const {
    handle,
    loading: handleLoading,
    failed: handleFailed,
    save,
    retry,
  } = useOwnProfileHandle();
  const publicHandle = defineModel<string | null>({ required: true });
  const props = defineProps<{ hasPublicMode: boolean }>();
  const hasPublicMode = computed(() => props.hasPublicMode);
  watch(
    handle,
    (value) => {
      publicHandle.value = value ?? null;
    },
    { immediate: true }
  );
  const handleInput = ref('');
  const handleError = ref('');
  const savingHandle = ref(false);
  const editingHandle = ref(false);
  const resetHandleForm = () => {
    editingHandle.value = false;
    handleInput.value = '';
    handleError.value = '';
  };
  const editHandle = () => {
    handleInput.value = handle.value ?? '';
    editingHandle.value = true;
  };
  const pmcSuggestion = computed(() => {
    if (!tarkovStore.getTarkovUid()) return '';
    const candidate = tarkovStore.getDisplayName()?.trim().toLowerCase();
    return isProfileHandle(candidate) ? candidate : '';
  });
  const saveHandle = async () => {
    if (savingHandle.value) return;
    savingHandle.value = true;
    handleError.value = '';
    const id = $supabase.user.id;
    try {
      const result = await save(handleInput.value.trim().toLowerCase());
      if ($supabase.user.id !== id || streamerMode.value) return;
      if (result === 'saved') resetHandleForm();
      if (result === 'invalid') handleError.value = t('settings.profile_sharing.handle_invalid');
      if (result === 'taken') handleError.value = t('settings.profile_sharing.handle_taken');
      if (result === 'cooldown') handleError.value = t('settings.profile_sharing.handle_cooldown');
      if (result === 'failed') handleError.value = t('settings.profile_sharing.handle_failed');
    } catch {
      if ($supabase.user.id === id && !streamerMode.value) {
        handleError.value = t('settings.profile_sharing.handle_failed');
      }
    } finally {
      savingHandle.value = false;
    }
  };
  watch([() => $supabase.user.id, streamerMode], resetHandleForm);
  const handleUrl = computed(() => {
    const path = profileHandlePath(handle.value ?? '');
    return import.meta.client ? new URL(path, window.location.origin).href : path;
  });
</script>
