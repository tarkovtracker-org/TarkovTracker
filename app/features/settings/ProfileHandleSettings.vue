<template>
  <div v-if="streamerMode" class="text-surface-400 text-sm">
    {{ t('settings.profile_sharing.handle_streamer') }}
  </div>
  <div v-else-if="handle" class="space-y-2">
    <p class="text-sm font-medium">{{ t('settings.profile_sharing.handle_label') }}</p>
    <a v-if="hasPublicMode" :href="handleUrl" class="text-info-300 mr-2 text-sm break-all">
      {{ handleUrl }}
    </a>
    <span v-else class="text-surface-400 text-sm">@{{ handle }}</span>
    <UButton v-if="hasPublicMode" size="xs" variant="soft" @click="copyToClipboard(handleUrl)">
      {{ t('page.profile.copy_profile_link') }}
    </UButton>
  </div>
  <p v-else-if="handleFailed" class="text-surface-400 text-sm">
    {{ t('settings.profile_sharing.handle_failed') }}
  </p>
  <form v-else-if="!handleLoading" class="space-y-2" @submit.prevent="saveHandle">
    <UFormField
      :label="t('settings.profile_sharing.handle_label')"
      :help="t('settings.profile_sharing.handle_help')"
      :error="handleError || undefined"
    >
      <div class="flex flex-wrap gap-2">
        <UInput
          v-model="handleInput"
          autocomplete="off"
          autocapitalize="none"
          :spellcheck="false"
          :maxlength="24"
          placeholder="your_handle"
          @update:model-value="handleError = ''"
        />
        <UButton type="submit" :loading="claimingHandle">
          {{ t('settings.profile_sharing.handle_claim') }}
        </UButton>
      </div>
    </UFormField>
    <UButton
      v-if="pmcSuggestion && !handleInput"
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
  const { handle, loading: handleLoading, failed: handleFailed, claim } = useOwnProfileHandle();
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
  const claimingHandle = ref(false);
  const pmcSuggestion = computed(() => {
    if (!tarkovStore.getTarkovUid()) return '';
    const candidate = tarkovStore.getDisplayName()?.trim().toLowerCase();
    return isProfileHandle(candidate) ? candidate : '';
  });
  const saveHandle = async () => {
    if (claimingHandle.value) return;
    claimingHandle.value = true;
    handleError.value = '';
    try {
      const result = await claim(handleInput.value.trim().toLowerCase());
      if (result === 'invalid') handleError.value = t('settings.profile_sharing.handle_invalid');
      if (result === 'taken') handleError.value = t('settings.profile_sharing.handle_taken');
      if (result === 'failed') handleError.value = t('settings.profile_sharing.handle_failed');
    } catch {
      handleError.value = t('settings.profile_sharing.handle_failed');
    } finally {
      claimingHandle.value = false;
    }
  };
  watch(
    () => $supabase.user.id,
    () => {
      handleInput.value = '';
      handleError.value = '';
    }
  );
  const handleUrl = computed(() => {
    const path = profileHandlePath(handle.value ?? '');
    return import.meta.client ? new URL(path, window.location.origin).href : path;
  });
</script>
