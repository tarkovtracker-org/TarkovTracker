<template>
  <div v-if="streamerMode" class="text-surface-400 text-sm">
    {{ t('settings.profile_sharing.handle_streamer') }}
  </div>
  <div v-else-if="handle && !editingHandle" class="space-y-2">
    <p class="text-sm font-medium">{{ t('settings.profile_sharing.handle_label') }}</p>
    <template v-if="hasPublicMode">
      <a :href="handleUrl" class="text-info-300 mr-2 text-sm break-all">{{ handleUrl }}</a>
      <UButton size="xs" variant="soft" @click="copyToClipboard(handleUrl)">
        {{ t('page.profile.copy_profile_link') }}
      </UButton>
    </template>
    <span v-else class="text-surface-400 text-sm">@{{ handle }}</span>
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
      :help="formCopy.help"
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
          {{ formCopy.submit }}
        </UButton>
        <UButton v-if="handle" variant="soft" :disabled="savingHandle" @click="resetHandleForm">
          {{ t('common.cancel') }}
        </UButton>
      </div>
    </UFormField>
    <UButton v-if="showPmcSuggestion" size="xs" variant="soft" @click="handleInput = pmcSuggestion">
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
  const formCopy = computed(() =>
    handle.value
      ? {
          help: t('settings.profile_sharing.handle_rename_help'),
          submit: t('settings.profile_sharing.handle_save'),
        }
      : {
          help: t('settings.profile_sharing.handle_help'),
          submit: t('settings.profile_sharing.handle_claim'),
        }
  );
  const handleErrorKeys = {
    invalid: 'settings.profile_sharing.handle_invalid',
    taken: 'settings.profile_sharing.handle_taken',
    cooldown: 'settings.profile_sharing.handle_cooldown',
    failed: 'settings.profile_sharing.handle_failed',
  } as const;
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
  const showPmcSuggestion = computed(
    () => !handle.value && !!pmcSuggestion.value && !handleInput.value
  );
  const saveHandle = async () => {
    if (savingHandle.value) return;
    savingHandle.value = true;
    handleError.value = '';
    const id = $supabase.user.id;
    const result = await save(handleInput.value.trim().toLowerCase()).catch(
      () => 'failed' as const
    );
    savingHandle.value = false;
    if ($supabase.user.id !== id || streamerMode.value) return;
    if (result === 'saved') resetHandleForm();
    else handleError.value = t(handleErrorKeys[result]);
  };
  watch([() => $supabase.user.id, streamerMode], resetHandleForm);
  const handleUrl = computed(() => {
    const path = profileHandlePath(handle.value ?? '');
    return import.meta.client ? new URL(path, window.location.origin).href : path;
  });
</script>
