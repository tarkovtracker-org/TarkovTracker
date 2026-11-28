<template>
  <form
    class="bg-surface-900/90 space-y-6 rounded-xl border border-white/10 p-5 shadow-sm sm:p-6"
    novalidate
    @submit.prevent="submit(retryDestination ?? (isFreshStart ? 'finish' : 'continue'))"
  >
    <fieldset :disabled="submitting" class="min-w-0 space-y-6">
      <SetupModeSelector
        :selected-modes="selectedModes"
        :primary-mode="primaryMode"
        @toggle="toggleMode"
        @update-primary="primaryMode = $event"
      />
      <div class="h-px bg-white/8" />
      <section class="max-w-md space-y-2">
        <label
          for="setup-game-edition"
          class="text-surface-100 block cursor-pointer text-sm font-semibold"
        >
          {{ $t('common.game_edition') }}
        </label>
        <p class="text-surface-400 text-xs">{{ $t('setup.profile.edition_hint') }}</p>
        <SelectMenuFixed
          id="setup-game-edition"
          v-model="selectedEdition"
          :items="gameEditionOptions"
          value-key="value"
          :placeholder="$t('setup.ready.edition_fallback')"
          class="w-full"
        >
          <template #leading>
            <UIcon name="i-mdi-gift-open" class="text-surface-300 size-4" />
          </template>
        </SelectMenuFixed>
      </section>
      <div class="h-px bg-white/8" />
      <section class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="space-y-0.5">
            <h3 class="text-surface-100 text-sm font-semibold">
              {{ $t('setup.profile.character_title') }}
            </h3>
            <p class="text-surface-400 text-xs">{{ $t('setup.profile.character_hint') }}</p>
          </div>
          <div v-if="selectedModes.length > 1" class="flex flex-wrap gap-1.5" role="tablist">
            <UButton
              v-for="tab in characterModeTabs"
              :key="tab.mode"
              type="button"
              role="tab"
              size="xs"
              :aria-selected="tab.active"
              :color="tab.active ? 'primary' : 'neutral'"
              :variant="tab.active ? 'solid' : 'soft'"
              @click="editingMode = tab.mode"
            >
              <GameModeBadge :mode="tab.mode" :size="28" class="-my-1" />
              <span>{{ tab.label }}</span>
            </UButton>
          </div>
        </div>
        <div
          class="bg-surface-950/55 grid gap-5 rounded-xl border border-white/8 p-4 sm:grid-cols-2"
        >
          <div class="space-y-2">
            <p class="text-surface-200 text-sm font-medium">{{ $t('settings.faction.title') }}</p>
            <FactionPicker v-model="activeDraft.faction" class="max-w-52" />
            <p class="text-surface-400 text-xs">{{ $t('setup.profile.faction_hint') }}</p>
          </div>
          <UFormField
            :label="$t('settings.player_level.label')"
            :help="levelRangeHint"
            :error="activeLevelError"
            name="setup-player-level"
          >
            <UInput
              v-model="activeDraft.levelText"
              type="number"
              inputmode="numeric"
              step="1"
              :min="minLevel"
              :max="maxLevel"
              class="w-28"
            />
          </UFormField>
          <div v-if="showPrestigeField" class="space-y-2">
            <label for="setup-prestige-level" class="text-surface-200 block text-sm font-medium">
              {{ $t('common.prestige') }}
            </label>
            <SelectMenuFixed
              id="setup-prestige-level"
              v-model="activeDraft.prestigeLevel"
              :items="prestigeOptions"
              value-key="value"
              class="max-w-xs"
            >
              <template #leading>
                <UIcon name="i-mdi-trophy" class="text-warning-400 size-4" />
              </template>
            </SelectMenuFixed>
          </div>
          <div class="space-y-2">
            <label for="setup-display-name" class="text-surface-200 block text-sm font-medium">
              {{ $t('setup.profile.display_name_label') }}
            </label>
            <UInput
              id="setup-display-name"
              v-model="activeDraft.displayName"
              :maxlength="LIMITS.DISPLAY_NAME_MAX_LENGTH"
              :placeholder="$t('setup.profile.display_name_placeholder')"
              class="max-w-xs"
            />
          </div>
        </div>
        <p v-if="switchModeError" class="text-error-400 text-sm" role="alert">
          {{ $t(switchModeError) }}
        </p>
        <p v-else-if="retryDestination" class="text-error-400 text-sm" role="alert">
          {{ $t('setup.profile.save_failed') }}
        </p>
      </section>
    </fieldset>
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4">
      <UButton
        type="button"
        color="neutral"
        variant="ghost"
        icon="i-mdi-arrow-left"
        :disabled="submitting"
        @click="emit('back')"
      >
        {{ $t('setup.back') }}
      </UButton>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="soft"
          :disabled="submitDisabled"
          @click="submit(secondaryAction.destination)"
        >
          {{ secondaryAction.label }}
        </UButton>
        <UButton
          type="submit"
          color="primary"
          variant="solid"
          :trailing-icon="primaryAction.icon"
          :loading="submitting"
          :disabled="submitDisabled"
        >
          {{ retryDestination ? $t('setup.retry_save') : primaryAction.label }}
        </UButton>
      </div>
    </div>
  </form>
</template>
<script setup lang="ts">
  import FactionPicker from '@/components/FactionPicker.vue';
  import GameModeBadge from '@/components/GameModeBadge.vue';
  import { useGameModeSwitch } from '@/composables/useGameModeSwitch';
  import { parsePlayerLevel } from '@/composables/usePlayerLevelEditor';
  import SetupModeSelector from '@/features/setup/SetupModeSelector.vue';
  import { flushActiveProgressWrites } from '@/stores/tarkov/localStorage';
  import { progressSaveStatus } from '@/stores/tarkov/progressSaveStatus';
  import { captureStartupOwnership } from '@/stores/tarkov/startupOwnership';
  import { useMetadataStore } from '@/stores/useMetadata';
  import { useTarkovStore } from '@/stores/useTarkov';
  import {
    GAME_MODES,
    getGameModeLabel,
    LIMITS,
    type GameMode,
    type PMCFaction,
  } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  type ModeDraft = {
    faction: PMCFaction;
    levelText: string;
    prestigeLevel: number;
    displayName: string;
  };
  const emit = defineEmits<{ back: []; continue: []; finish: []; busy: [value: boolean] }>();
  type SubmitDestination = 'continue' | 'finish';
  const { t } = useI18n({ useScope: 'global' });
  const { $supabase } = useNuxtApp();
  const tarkovStore = useTarkovStore();
  const metadataStore = useMetadataStore();
  const { switchMode, switchModeError } = useGameModeSwitch();
  const initialMode = tarkovStore.getCurrentGameMode();
  const selectedModes = ref<GameMode[]>([initialMode]);
  const primaryMode = ref<GameMode>(initialMode);
  const editingMode = ref<GameMode>(initialMode);
  const selectedEdition = ref<number>(tarkovStore.getGameEdition() || 1);
  const submitting = ref(false);
  const retryDestination = ref<SubmitDestination | null>(null);
  let active = true;
  watch(submitting, (value) => emit('busy', value), { flush: 'sync' });
  onScopeDispose(() => {
    active = false;
    if (submitting.value) emit('busy', false);
  });
  const normalizeFaction = (value: string | undefined): PMCFaction =>
    value === 'BEAR' ? 'BEAR' : 'USEC';
  function readModeDraft(mode: GameMode): ModeDraft {
    const data = tarkovStore[mode];
    return {
      faction: normalizeFaction(data.pmcFaction),
      levelText: String(data.level || 1),
      prestigeLevel: data.prestigeLevel || 0,
      displayName: tarkovStore.getModeDisplayName(mode) || '',
    };
  }
  const modeDrafts = reactive<Record<GameMode, ModeDraft>>({
    [GAME_MODES.PVP]: readModeDraft(GAME_MODES.PVP),
    [GAME_MODES.PVE]: readModeDraft(GAME_MODES.PVE),
    [GAME_MODES.SEASONAL]: readModeDraft(GAME_MODES.SEASONAL),
  });
  const activeDraft = computed(() => modeDrafts[editingMode.value]);
  const showPrestigeField = computed(() => editingMode.value !== GAME_MODES.SEASONAL);
  const minLevel = computed(() => metadataStore.minPlayerLevel);
  const maxLevel = computed(() => metadataStore.maxPlayerLevel);
  const levelBounds = computed(() => ({ min: minLevel.value, max: maxLevel.value }));
  const levelRangeHint = computed(() =>
    t('settings.player_level.range_hint_fallback', levelBounds.value)
  );
  function parsedLevelFor(mode: GameMode) {
    return parsePlayerLevel(modeDrafts[mode].levelText, levelBounds.value);
  }
  const activeLevelError = computed(() => {
    const result = parsedLevelFor(editingMode.value);
    return result.ok
      ? undefined
      : t(`settings.player_level.errors.${result.error}`, levelBounds.value);
  });
  const allLevelsValid = computed(() =>
    selectedModes.value.every((mode) => parsedLevelFor(mode).ok)
  );
  const submitDisabled = computed(() => submitting.value || !allLevelsValid.value);
  const isFreshStart = computed(() =>
    selectedModes.value.every((mode) => {
      const parsed = parsedLevelFor(mode);
      return parsed.ok && parsed.level === 1;
    })
  );
  const primaryAction = computed(() =>
    isFreshStart.value
      ? { label: t('setup.profile.finish_fresh'), icon: 'i-mdi-check' }
      : { label: t('setup.profile.continue_logs'), icon: 'i-mdi-arrow-right' }
  );
  const secondaryAction = computed(() =>
    isFreshStart.value
      ? { label: t('setup.profile.continue_to_imports'), destination: 'continue' as const }
      : { label: t('setup.profile.skip_to_ready'), destination: 'finish' as const }
  );
  const characterModeTabs = computed(() =>
    selectedModes.value.map((mode) => ({
      mode,
      active: editingMode.value === mode,
      label: `${t(getGameModeLabel(mode))} · ${modeDrafts[mode].faction} · ${t('common.lv')} ${modeDrafts[mode].levelText || '?'}`,
    }))
  );
  const gameEditionOptions = computed(() =>
    metadataStore.editions.map((edition) => ({
      label: edition.title,
      value: edition.value,
    }))
  );
  const prestigeOptions = computed(() =>
    Array.from({ length: 7 }, (_, index) => ({
      label: index === 0 ? t('prestige.no_prestige') : t('prestige.prestige_n', { n: index }),
      value: index,
    }))
  );
  function removeSelectedMode(mode: GameMode) {
    const next = selectedModes.value.filter((entry) => entry !== mode);
    if (!next.length) return;
    selectedModes.value = next;
    const fallback = next[0]!;
    if (primaryMode.value === mode) primaryMode.value = fallback;
    if (editingMode.value === mode) editingMode.value = fallback;
  }
  function toggleMode(mode: GameMode) {
    if (selectedModes.value.includes(mode)) {
      removeSelectedMode(mode);
      return;
    }
    selectedModes.value = [...selectedModes.value, mode];
    editingMode.value = mode;
  }
  function applySingleModeDraft(mode: GameMode) {
    const parsed = parsedLevelFor(mode);
    if (!parsed.ok) return;
    const draft = modeDrafts[mode];
    const trimmedName = draft.displayName.trim();
    tarkovStore.$patch((state) => {
      state[mode].pmcFaction = draft.faction;
      state[mode].level = parsed.level;
      if (mode !== GAME_MODES.SEASONAL) state[mode].prestigeLevel = draft.prestigeLevel;
      if (trimmedName) state[mode].displayName = trimmedName;
    });
  }
  async function selectPrimaryMode(): Promise<boolean> {
    switchModeError.value = '';
    const target = primaryMode.value;
    if (tarkovStore.getCurrentGameMode() === target) return true;
    await switchMode(target);
    if (tarkovStore.getCurrentGameMode() === target && !switchModeError.value) return true;
    switchModeError.value ||= 'settings.game_settings.switch_mode_failed';
    return false;
  }
  async function persistProfileChanges(ownsSession: () => boolean): Promise<boolean> {
    if (!(await selectPrimaryMode()) || !ownsSession()) return false;
    tarkovStore.setGameEdition(selectedEdition.value || 1);
    selectedModes.value.forEach(applySingleModeDraft);
    if (progressSaveStatus.local === 'failed') tarkovStore.$persist();
    const saved = await tarkovStore.saveProgressNow();
    if (!ownsSession()) return false;
    await flushActiveProgressWrites();
    return saved && progressSaveStatus.local !== 'failed';
  }
  async function submit(destination: SubmitDestination) {
    if (submitting.value) return;
    const invalidMode = selectedModes.value.find((mode) => !parsedLevelFor(mode).ok);
    if (invalidMode) {
      editingMode.value = invalidMode;
      return;
    }
    const ownsGeneration = captureStartupOwnership();
    const owner = $supabase.user.id;
    const ownsSession = () => active && ownsGeneration() && $supabase.user.id === owner;
    submitting.value = true;
    retryDestination.value = null;
    try {
      const saved = await persistProfileChanges(ownsSession);
      if (!ownsSession()) return;
      if (!saved) {
        retryDestination.value = destination;
        return;
      }
      if (destination === 'finish') emit('finish');
      else emit('continue');
    } catch (error) {
      if (!ownsSession()) return;
      retryDestination.value = destination;
      logger.error('[Setup] Could not save the profile', error);
    } finally {
      if (active) submitting.value = false;
    }
  }
</script>
