<template>
  <div class="bg-surface-900/80 space-y-3 rounded-md border border-white/10 p-3">
    <div class="flex items-center justify-between gap-3">
      <span class="text-surface-400 text-sm">
        {{ $t('settings.tarkov_dev_import.linked_uid') }}
      </span>
      <span class="text-surface-100 font-mono text-sm font-semibold">
        {{ tarkovUid }}
      </span>
    </div>
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-surface-300 text-xs font-semibold">
          {{ $t('settings.tarkov_dev_import.refetch_modes_label') }}
        </span>
        <UButton
          size="xs"
          :color="selectAllColor"
          :variant="selectAllVariant"
          :disabled="anyImportActive"
          @click="emit('selectAll')"
        >
          {{ $t('settings.tarkov_dev_import.select_all_modes') }}
        </UButton>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <UButton
          v-for="option in renderedModeOptions"
          :key="option.value"
          :variant="option.variant"
          :color="option.color"
          size="xs"
          class="justify-center"
          :aria-pressed="option.selected"
          :disabled="option.isDisabled"
          @click="emit('toggleMode', option.value)"
        >
          <GameModeBadge :mode="option.value" class="-my-1" />
          <span class="min-w-0 wrap-anywhere">{{ option.label }}</span>
        </UButton>
      </div>
      <p class="text-surface-500 text-xs">
        {{ $t('settings.tarkov_dev_import.refetch_mode_arena_unavailable') }}
      </p>
    </div>
    <div
      v-if="!readyToFetch"
      class="bg-surface-950/60 space-y-2.5 rounded-lg border border-white/8 p-3"
    >
      <div class="space-y-0.5">
        <p class="text-surface-100 text-xs font-semibold">
          {{ $t('settings.tarkov_dev_import.linked_step_1_title') }}
        </p>
        <p class="text-surface-400 text-xs">
          {{ $t(step1HintKey) }}
        </p>
      </div>
      <div v-if="isMultiMode" class="flex flex-wrap items-center gap-2">
        <UButton
          v-for="link in selectedModeLinks"
          :key="link.mode"
          icon="i-mdi-open-in-new"
          color="info"
          variant="subtle"
          size="xs"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          :disabled="link.isDisabled"
        >
          <GameModeBadge :mode="link.mode" :size="24" class="-my-1" />
          <span>{{ link.label }}</span>
        </UButton>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            icon="i-mdi-link-off"
            variant="ghost"
            color="neutral"
            size="sm"
            :disabled="anyImportActive"
            @click="emit('unlink')"
          >
            {{ $t('settings.tarkov_dev_import.unlink_profile') }}
          </UButton>
          <UButton
            v-if="!isMultiMode"
            variant="soft"
            color="neutral"
            size="sm"
            :disabled="continueDisabled"
            @click="emit('beginRefresh')"
          >
            {{ $t('settings.tarkov_dev_import.already_viewed_continue') }}
          </UButton>
        </div>
        <UButton
          :icon="step1PrimaryIcon"
          color="primary"
          variant="solid"
          size="sm"
          :href="step1PrimaryHref"
          :target="step1PrimaryTarget"
          :rel="step1PrimaryRel"
          :disabled="step1PrimaryDisabled"
          @click="emit('beginRefresh')"
        >
          {{ $t(step1PrimaryLabelKey) }}
        </UButton>
      </div>
    </div>
    <div v-else class="bg-surface-950/60 border-info-500/25 space-y-2.5 rounded-lg border p-3">
      <div class="space-y-0.5">
        <p class="text-surface-100 text-xs font-semibold">
          {{ $t('settings.tarkov_dev_import.linked_step_2_title') }}
        </p>
        <p class="text-surface-400 text-xs">
          {{ $t('settings.tarkov_dev_import.linked_step_2_hint') }}
        </p>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            :disabled="anyImportActive"
            @click="emit('cancelRefresh')"
          >
            {{ $t('setup.back') }}
          </UButton>
          <UButton
            icon="i-mdi-link-off"
            variant="ghost"
            color="neutral"
            size="sm"
            :disabled="anyImportActive"
            @click="emit('unlink')"
          >
            {{ $t('settings.tarkov_dev_import.unlink_profile') }}
          </UButton>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="!isMultiMode"
            icon="i-mdi-open-in-new"
            variant="subtle"
            color="info"
            size="sm"
            :href="profileUrl"
            target="_blank"
            rel="noopener noreferrer"
            :disabled="!profileUrl"
          >
            {{ $t('common.view_on_tarkov_dev') }}
          </UButton>
          <UButton
            icon="i-mdi-refresh"
            color="primary"
            variant="solid"
            size="sm"
            :disabled="fetchDisabled"
            :loading="loading"
            @click="emit('refetch')"
          >
            {{ refetchButtonLabel }}
          </UButton>
        </div>
      </div>
    </div>
    <p v-if="cooldownMinutes > 0" class="text-surface-500 text-xs">
      {{ $t('settings.tarkov_dev_import.cooldown_hint', { minutes: cooldownMinutes }) }}
    </p>
  </div>
</template>
<script setup lang="ts">
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { GAME_MODE_VALUES, getGameModeLabel, type GameMode } from '@/utils/constants';
  import { buildTarkovDevProfileUrl } from '@/utils/tarkovDevProfileUrl';
  type RefetchMode = GameMode | 'arena';
  type RefetchModeOption = {
    value: RefetchMode;
    label: string;
    disabled: boolean;
    color: 'info' | 'neutral';
  };
  const props = defineProps<{
    tarkovUid: number | null;
    selectedModes: readonly GameMode[];
    modeOptions: readonly RefetchModeOption[];
    modeSupported: boolean;
    profileUrl?: string;
    readyToFetch: boolean;
    anyImportActive: boolean;
    fetchDisabled: boolean;
    loading: boolean;
    cooldownMinutes: number;
  }>();
  const emit = defineEmits<{
    toggleMode: [mode: RefetchMode];
    selectAll: [];
    beginRefresh: [];
    cancelRefresh: [];
    refetch: [];
    unlink: [];
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const allSelected = computed(() =>
    GAME_MODE_VALUES.every((mode) => props.selectedModes.includes(mode))
  );
  const selectAllColor = computed(() => (allSelected.value ? 'info' : 'neutral'));
  const selectAllVariant = computed(() => (allSelected.value ? 'solid' : 'soft'));
  const renderedModeOptions = computed(() =>
    props.modeOptions.map((option) => {
      const selected = option.value !== 'arena' && props.selectedModes.includes(option.value);
      return {
        ...option,
        selected,
        variant: selected ? ('solid' as const) : ('soft' as const),
        isDisabled: props.anyImportActive || option.disabled,
      };
    })
  );
  const selectedModeLinks = computed(() =>
    props.selectedModes.map((mode) => {
      const url = buildTarkovDevProfileUrl(props.tarkovUid, mode);
      return {
        mode,
        label: t(getGameModeLabel(mode)),
        url,
        isDisabled: !url || props.anyImportActive,
      };
    })
  );
  const isMultiMode = computed(() => props.selectedModes.length > 1);
  const continueDisabled = computed(() => !props.modeSupported || props.anyImportActive);
  const step1HintKey = computed(() =>
    isMultiMode.value
      ? 'settings.tarkov_dev_import.linked_step_1_hint_multi'
      : 'settings.tarkov_dev_import.linked_step_1_hint'
  );
  const step1PrimaryIcon = computed(() =>
    isMultiMode.value ? 'i-mdi-arrow-right' : 'i-mdi-open-in-new'
  );
  const step1PrimaryLabelKey = computed(() =>
    isMultiMode.value
      ? 'settings.tarkov_dev_import.continue_to_fetch'
      : 'settings.tarkov_dev_import.open_profile_and_continue'
  );
  const step1PrimaryHref = computed(() => (isMultiMode.value ? undefined : props.profileUrl));
  const step1PrimaryTarget = computed(() => (isMultiMode.value ? undefined : '_blank'));
  const step1PrimaryRel = computed(() => (isMultiMode.value ? undefined : 'noopener noreferrer'));
  const step1PrimaryDisabled = computed(() =>
    isMultiMode.value ? continueDisabled.value : !props.profileUrl || props.anyImportActive
  );
  const refetchButtonLabel = computed(() =>
    isMultiMode.value
      ? t('settings.tarkov_dev_import.refetch_selected_profiles', {
          count: props.selectedModes.length,
        })
      : t('settings.tarkov_dev_import.refetch_profile')
  );
</script>
