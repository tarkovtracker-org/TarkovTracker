<template>
  <li
    class="space-y-2 rounded-md border border-white/10 p-3"
    :data-testid="`superseded-copy-${copy.id}`"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p class="text-surface-100 text-sm font-semibold">{{ label }}</p>
      <p class="text-surface-400 text-xs">{{ describe(copy.progress) }}</p>
    </div>
    <p v-if="!restorable" class="text-surface-400 text-xs">
      {{ $t('settings.data_management.superseded_other_season') }}
    </p>
    <div v-if="pending" class="space-y-2" role="group">
      <p class="text-surface-300 text-sm">{{ confirmation }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          :color="pending === 'restore' ? 'primary' : 'error'"
          data-testid="superseded-confirm"
          @click="confirmPending"
        >
          {{ $t(`settings.data_management.superseded_${pending}_confirm`, { mode: modeLabel }) }}
        </UButton>
        <UButton size="sm" color="neutral" variant="soft" @click="pending = null">
          {{ $t('common.cancel') }}
        </UButton>
      </div>
    </div>
    <div v-else class="flex flex-wrap gap-2">
      <UButton
        v-if="restorable"
        size="sm"
        color="primary"
        variant="soft"
        icon="i-mdi-restore"
        data-testid="superseded-restore"
        @click="pending = 'restore'"
      >
        {{ $t('settings.data_management.superseded_restore') }}
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="soft"
        icon="i-mdi-download"
        data-testid="superseded-download"
        @click="handleDownload"
      >
        {{ $t('settings.data_management.superseded_download') }}
      </UButton>
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-mdi-delete-outline"
        data-testid="superseded-discard"
        @click="pending = 'discard'"
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
  const props = defineProps<{
    copy: SupersededProgressCopy;
    backup: Pick<
      UseDataBackupReturn,
      'discardSupersededProgress' | 'exportSupersededProgress' | 'restoreSupersededProgress'
    >;
  }>();
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  const tarkovStore = useTarkovStore();
  const pending = ref<PendingAction | null>(null);
  const restorable = computed(() => isRestorableSupersededCopy(props.copy));
  const modeLabel = computed(() => t(getGameModeLabel(props.copy.mode)));
  const capturedAt = computed(() =>
    new Date(props.copy.supersededAt).toLocaleString(undefined, {
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
  const describe = (progress: UserProgressData | undefined) =>
    t('settings.data_management.superseded_copy_summary', {
      level: progress?.level ?? 1,
      count: Object.keys(progress?.taskCompletions ?? {}).length,
    });
  const confirmation = computed(() =>
    pending.value === 'restore'
      ? t('settings.data_management.superseded_restore_confirmation', {
          mode: modeLabel.value,
          current: describe(tarkovStore.$state[props.copy.mode]),
        })
      : t('settings.data_management.superseded_discard_confirmation')
  );
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
    } catch (error) {
      reportFailure(error, 'settings.data_management.superseded_discard_failed');
    }
  }
  function confirmPending() {
    const action = pending.value === 'restore' ? restore : discard;
    pending.value = null;
    action();
  }
  async function handleDownload() {
    try {
      await props.backup.exportSupersededProgress(props.copy.id);
    } catch (error) {
      reportFailure(error, 'settings.data_management.superseded_download_failed');
    }
  }
</script>
