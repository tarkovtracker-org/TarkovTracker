<template>
  <form
    class="bg-surface-900/80 space-y-3 rounded-md border border-white/10 p-3"
    @submit.prevent="emit('submit')"
  >
    <div class="space-y-2">
      <label for="tarkov-dev-profile-url" class="text-surface-200 block text-xs font-semibold">
        {{ $t('settings.tarkov_dev_import.profile_url_label') }}
      </label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <UInput
          id="tarkov-dev-profile-url"
          ref="urlInputRef"
          :model-value="profileUrl"
          type="url"
          icon="i-mdi-link-variant"
          class="min-w-0 flex-1"
          :aria-label="$t('settings.tarkov_dev_import.profile_url_label')"
          :disabled="anyImportActive"
          :placeholder="$t('settings.tarkov_dev_import.profile_url_placeholder')"
          @update:model-value="emit('update:profileUrl', String($event ?? ''))"
        />
        <UButton
          type="submit"
          icon="i-mdi-account-search"
          color="primary"
          variant="solid"
          class="justify-center"
          :disabled="submitDisabled"
          :loading="loading"
        >
          {{
            selectedModes.length > 1
              ? $t('settings.tarkov_dev_import.fetch_profiles_count', {
                  count: selectedModes.length,
                })
              : $t('settings.tarkov_dev_import.fetch_profile')
          }}
        </UButton>
      </div>
    </div>
    <div class="space-y-1.5 border-t border-white/8 pt-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-surface-300 text-xs font-semibold">
          {{ $t('settings.tarkov_dev_import.modes_to_check_label') }}
        </span>
        <UButton
          type="button"
          size="xs"
          :color="allSelectedColor"
          :variant="allSelectedVariant"
          :disabled="anyImportActive"
          @click="emit('selectAll')"
        >
          {{ $t('settings.tarkov_dev_import.select_all_modes') }}
        </UButton>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <UButton
          v-for="option in renderedModeOptions"
          :key="option.value"
          type="button"
          size="xs"
          color="info"
          :variant="option.variant"
          class="justify-center"
          :aria-pressed="option.selected"
          :disabled="anyImportActive"
          @click="emit('toggleMode', option.value)"
        >
          <GameModeBadge :mode="option.value" class="-my-1.5" />
          <span class="min-w-0 truncate">{{ option.label }}</span>
        </UButton>
      </div>
      <p class="text-surface-400 text-xs">
        {{ $t('settings.tarkov_dev_import.modes_to_check_hint') }}
      </p>
    </div>
  </form>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { GAME_MODE_VALUES, getGameModeLabel, type GameMode } from '@/utils/constants';
  const props = defineProps<{
    profileUrl: string;
    selectedModes: readonly GameMode[];
    anyImportActive: boolean;
    submitDisabled: boolean;
    loading: boolean;
  }>();
  const emit = defineEmits<{
    'update:profileUrl': [value: string];
    toggleMode: [mode: GameMode];
    selectAll: [];
    submit: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const urlInputRef = ref<{ inputRef?: HTMLInputElement } | null>(null);
  const allSelected = computed(() =>
    GAME_MODE_VALUES.every((mode) => props.selectedModes.includes(mode))
  );
  const allSelectedColor = computed(() => (allSelected.value ? 'info' : 'neutral'));
  const allSelectedVariant = computed(() => (allSelected.value ? 'solid' : 'soft'));
  const renderedModeOptions = computed(() =>
    GAME_MODE_VALUES.map((mode) => {
      const selected = props.selectedModes.includes(mode);
      return {
        value: mode,
        label: t(getGameModeLabel(mode)),
        selected,
        variant: selected ? ('solid' as const) : ('soft' as const),
      };
    })
  );
  defineExpose({
    focusInput: () => urlInputRef.value?.inputRef?.focus(),
  });
</script>
