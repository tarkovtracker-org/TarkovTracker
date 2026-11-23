<template>
  <div class="flex items-center gap-3 px-2.5 py-2">
    <DrawerEmblem
      :src="badgeSrc"
      :loading="isLoading"
      :size="40"
      fallback-icon="i-heroicons-photo"
    />
    <div class="min-w-0 flex-1">
      <div
        :id="labelId"
        class="text-surface-400 text-[10px] leading-none font-semibold tracking-wider uppercase"
      >
        {{ t('common.level') }}
      </div>
      <div class="mt-1 flex h-7 items-center">
        <span
          v-if="!editing"
          ref="levelDisplay"
          class="group/level text-surface-50 hover:text-primary-300 focus-visible:outline-primary inline-flex cursor-text items-center gap-1.5 rounded-sm text-2xl leading-none font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          tabindex="0"
          role="button"
          :aria-label="
            t(
              'navigation_drawer.level_display_editable',
              { level: savedLevel },
              'Level {level}, click or press Enter to edit'
            )
          "
          @click="startEditing"
          @keyup.enter="startEditing"
          @keydown.space.prevent="startEditing"
        >
          {{ savedLevel }}
          <UIcon
            name="i-mdi-pencil-outline"
            class="text-surface-500 size-3.5 opacity-0 transition-opacity group-hover/level:opacity-100 group-focus-visible/level:opacity-100"
            aria-hidden="true"
          />
        </span>
        <input
          v-else
          ref="levelInput"
          v-model="draft"
          type="number"
          inputmode="numeric"
          step="1"
          :min="minLevel"
          :max="maxLevel"
          :aria-label="t('navigation_drawer.level_input', { min: minLevel, max: maxLevel })"
          class="no-spinner focus-visible:outline-primary h-7 w-14 rounded-sm border bg-transparent px-1 text-2xl leading-none font-bold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1"
          :class="
            errorMessage
              ? 'border-error-500/60 text-error-400'
              : 'border-primary-500/60 text-surface-50'
          "
          v-bind="inputErrorAttrs"
          @blur="finishEditing"
          @keyup.enter="save"
          @keydown.esc.prevent.stop="cancelEditing"
        />
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-1" role="group" :aria-labelledby="labelId">
      <AppTooltip :text="t('navigation_drawer.decrement_level')">
        <button
          type="button"
          :class="STEPPER_BUTTON_CLASS"
          :disabled="savedLevel <= minLevel"
          :aria-label="t('navigation_drawer.decrement_level')"
          @click="stepLevel(-1)"
        >
          <UIcon name="i-heroicons-minus" class="size-4" />
        </button>
      </AppTooltip>
      <AppTooltip :text="t('navigation_drawer.increment_level')">
        <button
          type="button"
          :class="STEPPER_BUTTON_CLASS"
          :disabled="savedLevel >= maxLevel"
          :aria-label="t('navigation_drawer.increment_level')"
          @click="stepLevel(1)"
        >
          <UIcon name="i-heroicons-plus" class="size-4" />
        </button>
      </AppTooltip>
    </div>
  </div>
  <p
    v-if="showError"
    :id="errorId"
    class="text-error-400 px-2.5 pb-2 text-xs leading-tight"
    role="alert"
  >
    {{ errorMessage }}
  </p>
</template>
<script setup lang="ts">
  import { usePlayerLevelEditor } from '@/composables/usePlayerLevelEditor';
  import DrawerEmblem from '@/features/drawer/DrawerEmblem.vue';
  import { useDrawerLevelBadge } from '@/features/drawer/useDrawerLevelBadge';
  /** Level badge, click-to-edit level, and stepper for the expanded sidebar profile card. */
  const { t } = useI18n({ useScope: 'global' });
  const STEPPER_BUTTON_CLASS =
    'flex size-7 items-center justify-center rounded-sm border border-divider/60 bg-surface-800 text-surface-300 transition-colors hover:bg-surface-700 hover:text-surface-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-800 disabled:hover:text-surface-300';
  const editing = ref<boolean>(false);
  // A mode switch or hydration while editing discards the draft instead of saving it elsewhere.
  const { applyDraft, draft, errorMessage, maxLevel, minLevel, resetDraft, savedLevel, stepLevel } =
    usePlayerLevelEditor({
      onDraftReset: () => {
        editing.value = false;
      },
    });
  const { badgeSrc, isLoading } = useDrawerLevelBadge(savedLevel);
  const labelId = useId();
  const errorId = useId();
  const showError = computed<boolean>(() => editing.value && !!errorMessage.value);
  const inputErrorAttrs = computed(() =>
    errorMessage.value
      ? ({
          'aria-invalid': true,
          'aria-describedby': errorId,
        } as const)
      : {}
  );
  const levelInput = ref<HTMLInputElement | null>(null);
  const levelDisplay = ref<HTMLElement | null>(null);
  function startEditing(): void {
    resetDraft();
    editing.value = true;
    void nextTick(() => {
      levelInput.value?.focus();
    });
  }
  /** Keyboard closes (Enter, Escape) return focus to the level so the user keeps their place. */
  function closeEditorWithFocus(): void {
    editing.value = false;
    void nextTick(() => {
      levelDisplay.value?.focus();
    });
  }
  /** Enter saves a valid level; an invalid one keeps the editor open with its error shown. */
  function save(): void {
    if (applyDraft()) closeEditorWithFocus();
  }
  function cancelEditing(): void {
    resetDraft();
    closeEditorWithFocus();
  }
  /** Leaving the field saves a valid level and discards an invalid one rather than guessing. */
  function finishEditing(): void {
    if (!editing.value) return;
    if (!applyDraft()) resetDraft();
    editing.value = false;
  }
</script>
