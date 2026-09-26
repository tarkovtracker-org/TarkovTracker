import { hasUnsavedProgressChanges } from '@/stores/tarkov/progressSaveStatus';
import { logger } from '@/utils/logger';
/** Shared so any sign-out entry point opens the same confirmation. */
const confirmOpen = ref(false);
/**
 * Deliberate sign-out (see `CONTEXT.md`). Signing out stays available without cloud
 * connectivity; only memory-only changes require confirmation, and the default is to
 * stay signed in.
 */
export function useSignOut() {
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { t } = useI18n({ useScope: 'global' });
  const signingOut = ref(false);
  const signOutNow = async (): Promise<boolean> => {
    signingOut.value = true;
    try {
      await $supabase.signOut();
      return true;
    } catch (error) {
      logger.error('[SignOut] Sign out failed:', error);
      toast.add({ title: t('app_bar.logout_failed'), color: 'error' });
      return false;
    } finally {
      signingOut.value = false;
    }
  };
  /** Returns `false` when the confirmation opened instead of signing out. */
  const requestSignOut = async (): Promise<boolean> => {
    if (hasUnsavedProgressChanges()) {
      confirmOpen.value = true;
      return false;
    }
    return await signOutNow();
  };
  const discardAndSignOut = async (): Promise<boolean> => {
    confirmOpen.value = false;
    return await signOutNow();
  };
  return { confirmOpen, signingOut, requestSignOut, discardAndSignOut, signOutNow };
}
