<template>
  <GenericCard
    icon="mdi-gamepad-variant"
    icon-color="accent"
    highlight-color="accent"
    :title="$t('common.game_settings')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-5 px-4 py-4">
        <section class="space-y-3">
          <div class="flex items-center gap-2">
            <p class="text-surface-200 text-sm font-semibold">
              {{ $t('settings.display_name.label') }}
            </p>
            <UTooltip :text="$t('settings.display_name.explanation')">
              <UIcon name="i-mdi-information" class="text-surface-400 h-4 w-4" />
            </UTooltip>
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <form
              v-for="mode in DISPLAY_NAME_MODES"
              :key="mode"
              class="rounded-xl border p-3"
              :class="getModePanelClass(mode)"
              @submit.prevent="saveDisplayName(mode)"
            >
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <label
                    :for="getDisplayNameInputId(mode)"
                    class="inline-flex rounded-md border px-2 py-1 text-xs font-semibold tracking-[0.18em] uppercase"
                    :class="getModeBadgeClass(mode)"
                  >
                    {{ getModeLabel(mode) }}
                  </label>
                </div>
                <UFormField
                  :name="`${mode}-display-name`"
                  :error="getInlineDisplayNameError(mode)"
                  class="space-y-0"
                >
                  <div class="flex flex-wrap items-start gap-2.5">
                    <UInput
                      :id="getDisplayNameInputId(mode)"
                      v-model="localDisplayNames[mode]"
                      :maxlength="DISPLAY_NAME_MAX_LENGTH"
                      :placeholder="$t('settings.display_name.placeholder')"
                      :name="`${mode}-display-name`"
                      class="w-full sm:w-56"
                    />
                    <UButton
                      type="submit"
                      icon="i-mdi-check"
                      :color="getModeColor(mode)"
                      variant="soft"
                      size="sm"
                      class="min-w-24"
                      :disabled="!hasDisplayNameChanges(mode)"
                      :aria-label="$t('settings.display_name.save')"
                    >
                      {{ $t('settings.display_name.save') }}
                    </UButton>
                  </div>
                </UFormField>
              </div>
            </form>
          </div>
        </section>
        <div class="h-px bg-white/6" />
        <section class="max-w-sm space-y-2">
          <label
            :for="gameEditionInputId"
            class="text-surface-200 block cursor-pointer text-sm font-semibold"
          >
            {{ $t('common.game_edition') }}
          </label>
          <SelectMenuFixed
            :id="gameEditionInputId"
            v-model="selectedGameEdition"
            :items="gameEditionOptions"
            value-key="value"
          >
            <template #leading>
              <UIcon name="i-mdi-gift-open" class="text-surface-300 h-4 w-4" />
            </template>
          </SelectMenuFixed>
        </section>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, type GameMode } from '@/utils/constants';
  import { LIMITS } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  const DISPLAY_NAME_MODES = [
    GAME_MODES.PVP,
    GAME_MODES.PVE,
    GAME_MODES.SEASONAL,
  ] as const satisfies readonly GameMode[];
  type DisplayNameMode = (typeof DISPLAY_NAME_MODES)[number];
  const { t } = useI18n({ useScope: 'global' });
  const { trackDisplayNameSaved, trackSettingChanged } = useProductAnalytics();
  const metadataStore = useMetadataStore();
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const DISPLAY_NAME_MAX_LENGTH = LIMITS.DISPLAY_NAME_MAX_LENGTH;
  const gameEditionInputId = 'settings-game-edition-input';
  const currentGameMode = computed(() => tarkovStore.getCurrentGameMode() || GAME_MODES.PVP);
  const localDisplayNames = reactive<Record<DisplayNameMode, string>>({
    [GAME_MODES.PVP]: '',
    [GAME_MODES.PVE]: '',
    [GAME_MODES.SEASONAL]: '',
  });
  const getDisplayNameInputId = (mode: DisplayNameMode) => `settings-display-name-input-${mode}`;
  const getModeLabel = (mode: DisplayNameMode) => {
    if (mode === GAME_MODES.PVE) return t('common.pve');
    if (mode === GAME_MODES.SEASONAL) return t('common.seasonal_pvp');
    return t('common.pvp');
  };
  const getModeColor = (mode: DisplayNameMode) => (mode === GAME_MODES.SEASONAL ? 'warning' : mode);
  const getStoredDisplayName = (mode: DisplayNameMode) =>
    tarkovStore.getModeDisplayName(mode) || '';
  const getDisplayNameValidationError = (mode: DisplayNameMode) => {
    const trimmed = localDisplayNames[mode].trim();
    if (!trimmed.length) {
      return t('settings.display_name.empty_error');
    }
    if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      return t('settings.display_name.max_error', { max: DISPLAY_NAME_MAX_LENGTH });
    }
    return undefined;
  };
  const getInlineDisplayNameError = (mode: DisplayNameMode) => {
    if (!localDisplayNames[mode].length) {
      return undefined;
    }
    return getDisplayNameValidationError(mode);
  };
  const hasDisplayNameChanges = (mode: DisplayNameMode) => {
    const trimmed = localDisplayNames[mode].trim();
    return trimmed !== getStoredDisplayName(mode) && trimmed.length > 0;
  };
  const getModeBadgeClass = (mode: DisplayNameMode) => {
    if (mode === GAME_MODES.PVE) return 'border-pve-500/30 bg-pve-700/25 text-pve-200';
    if (mode === GAME_MODES.SEASONAL) {
      return 'border-warning-500/30 bg-warning-700/20 text-warning-200';
    }
    return 'border-pvp-500/30 bg-pvp-700/25 text-pvp-200';
  };
  const getModePanelClass = (mode: DisplayNameMode) => {
    if (currentGameMode.value !== mode) {
      return 'border-white/8 bg-surface-950/40';
    }
    if (mode === GAME_MODES.PVE) {
      return 'border-pve-500/30 bg-pve-950/15 ring-1 ring-pve-500/20';
    }
    if (mode === GAME_MODES.SEASONAL) {
      return 'border-warning-500/30 bg-warning-950/15 ring-1 ring-warning-500/20';
    }
    return 'border-pvp-500/30 bg-pvp-950/15 ring-1 ring-pvp-500/20';
  };
  const saveDisplayName = (mode: DisplayNameMode) => {
    const validationError = getDisplayNameValidationError(mode);
    if (validationError) {
      toast.add({
        title: t('common.validation_error'),
        description: validationError,
        color: 'error',
      });
      return;
    }
    const trimmedDisplayName = localDisplayNames[mode].trim();
    try {
      tarkovStore.setModeDisplayName(mode, trimmedDisplayName);
      localDisplayNames[mode] = trimmedDisplayName;
      trackDisplayNameSaved({
        gameMode: mode,
        length: trimmedDisplayName.length,
      });
      toast.add({
        title: t('settings.display_name.saved_title'),
        description: t('settings.display_name.saved_description', {
          mode: getModeLabel(mode),
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
  for (const mode of DISPLAY_NAME_MODES) {
    watch(
      () => tarkovStore.getModeDisplayName(mode),
      (newName) => {
        localDisplayNames[mode] = newName || '';
      },
      { immediate: true }
    );
  }
  const gameEditionOptions = computed(() =>
    metadataStore.editions.map((edition) => ({
      label: edition.title,
      value: edition.value,
    }))
  );
  const selectedGameEdition = computed({
    get(): number {
      return tarkovStore.getGameEdition() || 1;
    },
    set(newValue: number) {
      if (tarkovStore.getGameEdition() === newValue) {
        return;
      }
      tarkovStore.setGameEdition(newValue || 1);
      trackSettingChanged({
        area: 'profile',
        name: 'game_edition',
        value: newValue || 1,
      });
    },
  });
</script>
