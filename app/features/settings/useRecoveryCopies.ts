import {
  listSupersededProgressCopies,
  type SupersededProgressCopy,
} from '@/stores/tarkov/supersededProgress';
import { logger } from '@/utils/logger';
import { STORAGE_KEYS } from '@/utils/storageKeys';
import type { UseDataBackupReturn } from '@/composables/useDataBackup';
/** The signed-in owner's superseded copies, kept current across sign-in changes and other tabs. */
export function useSupersededCopies() {
  const { $supabase } = useNuxtApp();
  const read = (): SupersededProgressCopy[] =>
    $supabase.user.id ? listSupersededProgressCopies($supabase.user.id) : [];
  const copies = shallowRef(read());
  const refresh = () => {
    copies.value = read();
  };
  const refreshOnStorageChange = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(STORAGE_KEYS.progressSupersededPrefix)) {
      refresh();
    }
  };
  watch(() => [$supabase.user.id, $supabase.user.loggedIn], refresh, { flush: 'sync' });
  onMounted(() => {
    window.addEventListener('tt:superseded-progress-change', refresh);
    window.addEventListener('storage', refreshOnStorageChange);
  });
  onUnmounted(() => {
    window.removeEventListener('tt:superseded-progress-change', refresh);
    window.removeEventListener('storage', refreshOnStorageChange);
  });
  return { copies };
}
/** Translates a thrown `settings.*` key, falling back to a generic message for anything else. */
export function recoveryErrorMessage(
  t: (key: string) => string,
  error: unknown,
  fallbackKey: string
): string {
  const message = error instanceof Error ? error.message : '';
  return message.startsWith('settings.') ? t(message) : t(fallbackKey);
}
/** Downloads the device recovery archive and reports a failure without changing any copy. */
export function useRecoveryArchiveExport(
  backup: Pick<UseDataBackupReturn, 'exportDeviceProgressRecovery'>
) {
  const { t } = useI18n({ useScope: 'global' });
  const toast = useToast();
  return async function exportRecoveryArchive(): Promise<boolean> {
    try {
      await backup.exportDeviceProgressRecovery();
      return true;
    } catch (error) {
      logger.error('RecoveryCopies: recovery export failed', error);
      const tooLarge =
        error instanceof Error &&
        error.message === t('settings.data_management.recovery_archive_too_large');
      toast.add({
        title: t('settings.data_management.export_error_title'),
        description: tooLarge
          ? error.message
          : t('settings.data_management.recovery_export_failed'),
        color: 'error',
      });
      return false;
    }
  };
}
