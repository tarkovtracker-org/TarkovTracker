<template>
  <GenericCard
    icon="mdi-account-edit"
    icon-color="primary"
    highlight-color="primary"
    :title="$t('settings.display_name.title')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <form class="space-y-2 px-4 py-4" @submit.prevent="saveDisplayName">
        <div class="flex items-center gap-2">
          <label :for="displayNameInputId" class="text-surface-200 text-sm font-semibold">
            {{ $t('settings.display_name.label') }}
          </label>
          <UTooltip :text="$t('settings.display_name.explanation')">
            <UIcon name="i-mdi-information" class="text-surface-400 h-4 w-4" />
          </UTooltip>
        </div>
        <UFormField name="displayName" :error="displayNameError" class="space-y-0">
          <div class="flex flex-wrap items-start gap-2">
            <UInput
              :id="displayNameInputId"
              v-model="localDisplayName"
              :maxlength="DISPLAY_NAME_MAX_LENGTH"
              :placeholder="$t('settings.display_name.placeholder')"
              name="display-name"
              class="min-w-48 flex-1"
            />
            <UButton
              type="submit"
              icon="i-mdi-check"
              color="primary"
              variant="soft"
              size="sm"
              :disabled="!hasDisplayNameChanges"
              :aria-label="$t('settings.display_name.save')"
            />
          </div>
        </UFormField>
        <p class="text-surface-400 text-xs">
          {{
            $t('settings.display_name.mode_hint', {
              mode: currentModeLabel,
            })
          }}
        </p>
      </form>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { LIMITS } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const DISPLAY_NAME_MAX_LENGTH = LIMITS.DISPLAY_NAME_MAX_LENGTH;
  const displayNameInputId = 'settings-display-name-input';
  const localDisplayName = ref(tarkovStore.getDisplayName() || '');
  const displayName = computed(() => tarkovStore.getDisplayName());
  const currentModeLabel = computed(() =>
    (tarkovStore.getCurrentGameMode() || 'pvp').toUpperCase()
  );
  const hasDisplayNameChanges = computed(() => {
    const trimmed = localDisplayName.value.trim();
    const initial = displayName.value || '';
    return trimmed !== initial && trimmed.length > 0;
  });
  const displayNameError = computed(() => {
    const trimmed = localDisplayName.value.trim();
    if (!trimmed.length) {
      return t('settings.display_name.empty_error');
    }
    if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      return t('settings.display_name.max_error', { max: DISPLAY_NAME_MAX_LENGTH });
    }
    return undefined;
  });
  watch(displayName, (newName) => {
    localDisplayName.value = newName || '';
  });
  const saveDisplayName = () => {
    const validationError = displayNameError.value;
    if (validationError) {
      toast.add({
        title: t('settings.display_name.validation_error'),
        description: validationError,
        color: 'error',
      });
      return;
    }
    const trimmedDisplayName = localDisplayName.value.trim();
    try {
      tarkovStore.setDisplayName(trimmedDisplayName);
      localDisplayName.value = trimmedDisplayName;
      toast.add({
        title: t('settings.display_name.saved_title'),
        description: t('settings.display_name.saved_description', {
          mode: currentModeLabel.value,
        }),
        color: 'success',
      });
    } catch (error) {
      logger.error('[Settings] Error saving display name:', error);
      toast.add({
        title: t('settings.display_name.save_failed_title'),
        description: t('settings.display_name.save_failed_description'),
        color: 'error',
      });
    }
  };
</script>
