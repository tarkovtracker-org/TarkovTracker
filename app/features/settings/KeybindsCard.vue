<template>
  <GenericCard
    icon="i-mdi-keyboard-outline"
    icon-color="primary"
    highlight-color="primary"
    :fill-height="false"
    :title="t('settings.keybinds.title', 'Keyboard Shortcuts')"
    title-classes="text-lg font-semibold"
  >
    <template #content>
      <div class="space-y-6 px-4 py-4 text-white">
        <div class="space-y-4">
          <template v-for="(field, index) in keybindFields" :key="field.id">
            <USeparator v-if="index > 0" />
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-surface-100 text-sm font-semibold">
                  {{ field.label }}
                </p>
                <p class="text-surface-400 text-xs">
                  {{ field.description }}
                </p>
              </div>
              <div class="flex flex-col items-end gap-1.5">
                <UInput
                  readonly
                  :value="recordingField === field.id ? tempKeys : field.value"
                  :placeholder="t('settings.keybinds.record_placeholder', 'Click to record...')"
                  class="w-48 cursor-pointer text-center font-mono text-xs"
                  :color="getValidationColor(field.id)"
                  @focus="startRecording(field.id)"
                  @blur="stopRecording(field.id)"
                  @keydown="handleKeydown"
                />
                <span
                  v-if="warningMessages[field.id]"
                  class="text-right text-[10px]"
                  :class="getWarningClass(field.id)"
                >
                  {{ warningMessages[field.id] }}
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </GenericCard>
</template>
<script setup lang="ts">
  import GenericCard from '@/components/ui/GenericCard.vue';
  import { usePreferencesStore } from '@/stores/usePreferences';
  import { serializeKeybindEvent } from '@/utils/keybinds';
  const { t } = useI18n();
  const preferencesStore = usePreferencesStore();
  const keybindOmnibar = computed({
    get: () => preferencesStore.getKeybindOmnibar,
    set: (val) => preferencesStore.setKeybindOmnibar(val),
  });
  const keybindUndo = computed({
    get: () => preferencesStore.getKeybindUndo,
    set: (val) => preferencesStore.setKeybindUndo(val),
  });
  type KeybindFieldId = 'omnibar' | 'undo';
  const keybindFields = computed(() => [
    {
      id: 'omnibar' as const,
      label: t('settings.keybinds.omnibar_label', 'Global Search (Omnibar)'),
      description: t(
        'settings.keybinds.omnibar_description',
        'Press this shortcut to open the global search palette.'
      ),
      value: keybindOmnibar.value,
    },
    {
      id: 'undo' as const,
      label: t('settings.keybinds.undo_label', 'Undo Last Action'),
      description: t(
        'settings.keybinds.undo_description',
        'Press this shortcut to revert your most recent progress change.'
      ),
      value: keybindUndo.value,
    },
  ]);
  type WarningKind = 'none' | 'conflict' | 'system';
  const recordingField = ref<KeybindFieldId | null>(null);
  const tempKeys = ref('');
  const warnings = ref<Record<KeybindFieldId, WarningKind>>({
    omnibar: 'none',
    undo: 'none',
  });
  const startRecording = (field: KeybindFieldId) => {
    recordingField.value = field;
    tempKeys.value = t('settings.keybinds.recording', 'Press key combination...');
  };
  const stopRecording = (field: KeybindFieldId) => {
    if (recordingField.value === field) {
      recordingField.value = null;
      tempKeys.value = '';
    }
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (!recordingField.value) return;
    event.preventDefault();
    event.stopPropagation();
    // Ignore modifier keys on their own
    const modifiers = ['Control', 'Alt', 'Shift', 'Meta'];
    if (modifiers.includes(event.key)) {
      return;
    }
    if (event.key === 'Escape') {
      stopRecording(recordingField.value);
      const activeEl = document.activeElement as HTMLElement;
      activeEl?.blur();
      return;
    }
    const result = serializeKeybindEvent(event);
    if (recordingField.value === 'omnibar') {
      keybindOmnibar.value = result;
    } else if (recordingField.value === 'undo') {
      keybindUndo.value = result;
    }
    stopRecording(recordingField.value);
    const activeEl = document.activeElement as HTMLElement;
    activeEl?.blur();
  };
  const checkWarnings = () => {
    warnings.value.omnibar = 'none';
    warnings.value.undo = 'none';
    const omnibarVal = keybindOmnibar.value.toLowerCase();
    const undoVal = keybindUndo.value.toLowerCase();
    if (omnibarVal === undoVal) {
      warnings.value.omnibar = 'conflict';
      warnings.value.undo = 'conflict';
      return;
    }
    const isDangerous = (shortcut: string) => {
      const parts = shortcut.split('+');
      const hasCtrl = parts.includes('ctrl');
      const hasAlt = parts.includes('alt');
      const key = parts[parts.length - 1];
      if (!key) return false;
      const dangerousKeys = ['t', 'w', 'n', 'f', 'tab', 'r', 'q'];
      if (hasCtrl && dangerousKeys.includes(key)) return true;
      if (hasAlt && ['tab', 'f4'].includes(key)) return true;
      return false;
    };
    if (isDangerous(omnibarVal)) {
      warnings.value.omnibar = 'system';
    }
    if (isDangerous(undoVal)) {
      warnings.value.undo = 'system';
    }
  };
  watch([keybindOmnibar, keybindUndo], checkWarnings, { immediate: true });
  const warningMessages = computed(() => ({
    omnibar: warningMessageFor('omnibar'),
    undo: warningMessageFor('undo'),
  }));
  function warningMessageFor(field: KeybindFieldId): string {
    const kind = warnings.value[field];
    if (kind === 'conflict') {
      return field === 'omnibar'
        ? t('settings.keybinds.conflict_omnibar', 'Shortcut conflicts with Undo keybind.')
        : t('settings.keybinds.conflict_undo', 'Shortcut conflicts with Search keybind.');
    }
    if (kind === 'system') {
      return field === 'omnibar'
        ? t(
            'settings.keybinds.warn_system_omnibar',
            'Warning: May conflict with browser/OS system shortcuts (e.g. Ctrl+T, Ctrl+W, Alt+Tab).'
          )
        : t(
            'settings.keybinds.warn_system_undo',
            'Warning: May conflict with browser/OS system shortcuts (e.g. Ctrl+W, Ctrl+T, Alt+Tab).'
          );
    }
    return '';
  }
  const getValidationColor = (field: KeybindFieldId) => {
    if (recordingField.value === field) return 'primary';
    const kind = warnings.value[field];
    if (kind === 'none') return 'neutral';
    return kind === 'system' ? 'warning' : 'error';
  };
  const getWarningClass = (field: KeybindFieldId) => {
    const kind = warnings.value[field];
    if (kind === 'none') return '';
    return kind === 'system' ? 'text-warning-400' : 'text-error-400';
  };
</script>
