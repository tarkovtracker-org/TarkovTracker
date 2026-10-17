<template>
  <div class="space-y-3">
    <fieldset class="space-y-2" :disabled="disabled">
      <legend class="text-surface-200 text-sm font-semibold">
        {{ $t('settings.log_import.mode_filter_label') }}
      </legend>
      <div class="grid gap-2 sm:grid-cols-2">
        <UCheckbox
          v-for="mode in detectedModes"
          :key="mode"
          :model-value="modelValue.modes.includes(mode)"
          :label="`${modeLabel(mode)} (${modeCount(mode)})`"
          :disabled="disabled"
          @update:model-value="(enabled) => toggleMode(mode, Boolean(enabled))"
        />
      </div>
      <p class="text-surface-400 text-xs">{{ $t('settings.log_import.mode_filter_hint') }}</p>
    </fieldset>
    <fieldset class="space-y-2" :disabled="disabled">
      <legend class="text-surface-200 text-sm font-semibold">
        {{ $t('settings.log_import.state_filter_label') }}
      </legend>
      <div class="grid gap-2 sm:grid-cols-3">
        <UCheckbox
          v-for="status in EFT_QUEST_STATES"
          :key="status"
          :model-value="modelValue.statuses.includes(status)"
          :label="$t(stateLabels[status])"
          :disabled="disabled"
          @update:model-value="(enabled) => toggleState(status, Boolean(enabled))"
        />
      </div>
      <p class="text-surface-400 text-xs">{{ $t('settings.log_import.state_filter_hint') }}</p>
    </fieldset>
    <details class="space-y-2">
      <summary class="text-info-300 cursor-pointer text-sm font-semibold">
        {{ $t('settings.log_import.history_filter_label') }}
      </summary>
      <p class="text-surface-400 text-xs">{{ $t('settings.log_import.history_filter_hint') }}</p>
      <div v-for="mode in cutoffModes" :key="mode" class="space-y-1">
        <label :for="`${id}-${mode}`" class="text-surface-200 text-xs">
          {{ $t('settings.log_import.import_since', { mode: modeLabel(mode) }) }}
        </label>
        <UInput
          :id="`${id}-${mode}`"
          type="datetime-local"
          step="1"
          class="block w-full"
          :model-value="formatCutoff(modelValue.since[mode])"
          :disabled="disabled"
          @update:model-value="(value) => setCutoff(mode, String(value))"
        />
      </div>
    </details>
  </div>
</template>
<script setup lang="ts">
  import { GAME_MODE_VALUES, getGameModeLabel, type GameMode } from '@/utils/constants';
  import {
    EFT_QUEST_STATES,
    isInvalidEftLogCutoff,
    type EftLogImportSelection,
  } from '@/utils/eftLogImportSelection';
  import {
    isEligibleImportEvent,
    latestEftQuestEvents,
    type EftQuestEventMode,
    type EftQuestEventStatus,
    type EftQuestImportEvent,
  } from '@/utils/eftLogQuestParser';
  const props = defineProps<{
    modelValue: EftLogImportSelection;
    events: EftQuestImportEvent[];
    targetMode?: GameMode;
    disabled: boolean;
  }>();
  const emit = defineEmits<{ 'update:modelValue': [selection: EftLogImportSelection] }>();
  const { t } = useI18n({ useScope: 'global' });
  const id = useId();
  const stateLabels = {
    completed: 'settings.log_import.states.completed',
    started: 'settings.log_import.states.started',
    failed: 'settings.log_import.states.failed',
  } as const;
  const detectedEvents = computed(() => latestEftQuestEvents(props.events).filter(isMatched));
  function isMatched(event: EftQuestImportEvent): boolean {
    return event.mode === 'unknown'
      ? (event.matchedModes?.length ?? 1) > 0
      : isEligibleImportEvent(event);
  }
  const modeCount = (mode: EftQuestEventMode) =>
    detectedEvents.value.filter((event) => event.mode === mode).length;
  const detectedModes = computed(() =>
    ([...GAME_MODE_VALUES, 'unknown'] as const).filter((mode) => modeCount(mode) > 0)
  );
  const cutoffModes = computed(() =>
    GAME_MODE_VALUES.filter(
      (mode) =>
        (props.modelValue.modes.includes(mode) &&
          (modeCount(mode) > 0 || props.modelValue.since[mode] !== undefined)) ||
        (props.modelValue.modes.includes('unknown') && props.targetMode === mode)
    )
  );
  const modeLabel = (mode: EftQuestEventMode) =>
    mode === 'unknown' ? t('settings.log_import.unidentified_mode') : t(getGameModeLabel(mode));
  function toggle<T>(values: readonly T[], value: T, enabled: boolean): T[] {
    return enabled ? [...new Set([...values, value])] : values.filter((entry) => entry !== value);
  }
  function toggleMode(mode: EftQuestEventMode, enabled: boolean): void {
    emit('update:modelValue', {
      ...props.modelValue,
      modes: toggle(props.modelValue.modes, mode, enabled),
    });
  }
  function toggleState(status: EftQuestEventStatus, enabled: boolean): void {
    emit('update:modelValue', {
      ...props.modelValue,
      statuses: toggle(props.modelValue.statuses, status, enabled),
    });
  }
  function formatCutoff(time: number | undefined): string {
    if (time === undefined || isInvalidEftLogCutoff(time)) return '';
    const date = new Date(time);
    return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  }
  function setCutoff(mode: GameMode, value: string): void {
    const since = { ...props.modelValue.since, [mode]: value ? Date.parse(value) : undefined };
    emit('update:modelValue', { ...props.modelValue, since });
  }
</script>
