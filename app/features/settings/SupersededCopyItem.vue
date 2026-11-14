<template>
  <li
    class="space-y-2 rounded-md border border-white/10 p-3"
    :aria-labelledby="labelId"
    :data-testid="`superseded-copy-${copy.id}`"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p :id="labelId" class="text-surface-100 text-sm font-semibold">{{ label }}</p>
      <p class="text-surface-400 text-xs">{{ describe(copy.progress) }}</p>
    </div>
    <p v-if="!restorable" class="text-surface-400 text-xs">
      {{ $t('settings.data_management.superseded_other_season') }}
    </p>
    <div v-if="pending" class="space-y-2" role="group" :aria-labelledby="labelId">
      <p class="text-surface-300 text-sm">{{ confirmation }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          ref="confirmButton"
          size="sm"
          :color="pending === 'restore' ? 'primary' : 'error'"
          :disabled="locked"
          data-testid="superseded-confirm"
          @click="confirmPending"
        >
          {{ $t(`settings.data_management.superseded_${pending}_confirm`, { mode: modeLabel }) }}
        </UButton>
        <UButton size="sm" color="neutral" variant="soft" @click="cancelPending">
          {{ $t('common.cancel') }}
        </UButton>
      </div>
    </div>
    <div v-else class="flex flex-wrap gap-2">
      <UButton
        v-if="restorable"
        ref="restoreButton"
        size="sm"
        color="primary"
        variant="soft"
        icon="i-mdi-restore"
        :aria-describedby="labelId"
        :disabled="locked"
        data-testid="superseded-restore"
        @click="open('restore')"
      >
        {{ $t('settings.data_management.superseded_restore') }}
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        icon="i-mdi-download"
        :aria-describedby="labelId"
        data-testid="superseded-download"
        @click="handleDownload"
      >
        {{ $t('settings.data_management.superseded_download') }}
      </UButton>
      <UButton
        ref="discardButton"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-mdi-delete-outline"
        :aria-describedby="labelId"
        :disabled="locked"
        data-testid="superseded-discard"
        @click="open('discard')"
      >
        {{ $t('settings.data_management.superseded_discard') }}
      </UButton>
    </div>
  </li>
</template>
<script setup lang="ts">
  import { recoveryErrorMessage } from '@/features/settings/useRecoveryCopies';
  import {
    isRestorableSupersededCopy,
    type SupersededProgressCopy,
  } from '@/stores/tarkov/supersededProgress';
  import { useTarkovStore } from '@/stores/useTarkov';
  import { GAME_MODES, getGameModeLabel } from '@/utils/constants';
  import { logger } from '@/utils/logger';
  import type { UseDataBackupReturn } from '@/composables/useDataBackup';
  import type { UserProgressData } from '@/types/progress';
  type PendingAction = 'restore' | 'discard';
  type FocusableButton = { $el?: HTMLElement } | null;
  const props = defineProps<{
    copy: SupersededProgressCopy;
    backup: Pick<
      UseDataBackupReturn,
      'discardSupersededProgress' | 'exportSupersededProgress' | 'restoreSupersededProgress'
    >;
    /** True while an import could still overwrite the progress a restore or discard acts on. */
    locked: boolean;
  }>();
  const emit = defineEmits<{ discarded: [] }>();
  const { t, locale } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const pending = ref<PendingAction | null>(null);
  const confirmButton = ref<FocusableButton>(null);
  const restoreButton = ref<FocusableButton>(null);
  const discardButton = ref<FocusableButton>(null);
  const labelId = computed(() => `superseded-copy-${props.copy.id}-label`);
  const restorable = computed(() => isRestorableSupersededCopy(props.copy));
  const modeLabel = computed(() => t(getGameModeLabel(props.copy.mode)));
  const capturedAt = computed(() =>
    new Date(props.copy.supersededAt).toLocaleString(locale?.value || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  );
  const label = computed(() =>
    props.copy.mode === GAME_MODES.SEASONAL
      ? t('settings.data_management.superseded_copy_label_season', {
          mode: modeLabel.value,
          season: props.copy.seasonNumber,
          date: capturedAt.value,
        })
      : t('settings.data_management.superseded_copy_label', {
          mode: modeLabel.value,
          date: capturedAt.value,
        })
  );
  const describe = (progress: UserProgressData | undefined) => {
    const count = Object.keys(progress?.taskCompletions ?? {}).length;
    return t(
      'settings.data_management.superseded_copy_summary',
      { level: progress?.level ?? 1, count },
      count
    );
  };
  const confirmation = computed(() =>
    pending.value === 'restore'
      ? t('settings.data_management.superseded_restore_confirmation', {
          mode: modeLabel.value,
          current: describe(tarkovStore.$state[props.copy.mode]),
        })
      : t('settings.data_management.superseded_discard_confirmation')
  );
  /** Swapping the action row for its confirmation would otherwise drop keyboard focus. */
  const focusAfterRender = (button: Ref<FocusableButton>) =>
    nextTick(() => button.value?.$el?.focus());
  function open(action: PendingAction) {
    pending.value = action;
    void focusAfterRender(confirmButton);
  }
  function cancelPending() {
    const action = pending.value;
    pending.value = null;
    void focusAfterRender(action === 'restore' ? restoreButton : discardButton);
  }
  function reportFailure(error: unknown, fallbackKey: string) {
    logger.error('SupersededCopyItem: recovery copy action failed', error);
    toast.add({ title: recoveryErrorMessage(t, error, fallbackKey), color: 'error' });
  }
  function restore() {
    try {
      props.backup.restoreSupersededProgress(props.copy.id);
      toast.add({
        title: t('settings.data_management.superseded_restored', { mode: modeLabel.value }),
        color: 'success',
      });
    } catch (error) {
      reportFailure(error, 'settings.data_management.superseded_restore_failed');
    }
  }
  function discard() {
    try {
      props.backup.discardSupersededProgress(props.copy.id);
      // This item leaves the list, so the panel takes over keyboard focus.
      emit('discarded');
    } catch (error) {
      reportFailure(error, 'settings.data_management.superseded_discard_failed');
    }
  }
  function confirmPending() {
    const action = pending.value;
    pending.value = null;
    if (action === 'restore') {
      restore();
      void focusAfterRender(restoreButton);
      return;
    }
    discard();
    // Only a failed discard leaves this item in place.
    void focusAfterRender(discardButton);
  }
  async function handleDownload() {
    try {
      await props.backup.exportSupersededProgress(props.copy.id);
    } catch (error) {
      reportFailure(error, 'settings.data_management.superseded_download_failed');
    }
  }
</script>
