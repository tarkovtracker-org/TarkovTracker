import { hasUnsavedProgressChanges } from '@/stores/tarkov/progressSaveStatus';
import { logger } from '@/utils/logger';
/** Shared so any sign-out entry point opens the same confirmation. */
const confirmOpen = ref(false);
const confirmationOwner = ref<string | null>(null);
const clearConfirmation = (): void => {
  confirmOpen.value = false;
  confirmationOwner.value = null;
};
/**
 * Deliberate sign-out (see `CONTEXT.md`). Signing out stays available without cloud
 * connectivity; only memory-only changes require confirmation, and the default is to
 * stay signed in.
 */
export function useSignOut() {
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { t } = useI18n({ useScope: 'global' });
  const currentOwner = (): string | null => $supabase.user?.id ?? null;
  watch(() => [$supabase.user?.id, $supabase.user?.loggedIn], clearConfirmation, { flush: 'sync' });
  const signingOut = ref(false);
  const signOutNow = async (expectedUserId = currentOwner()): Promise<boolean> => {
    signingOut.value = true;
    try {
      await $supabase.signOut(expectedUserId ?? undefined);
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
      confirmationOwner.value = currentOwner();
      confirmOpen.value = true;
      return false;
    }
    return await signOutNow(currentOwner());
  };
  const discardAndSignOut = async (openingOwner: string | null): Promise<boolean> => {
    if (!confirmOpen.value || openingOwner !== confirmationOwner.value) return false;
    if (openingOwner !== currentOwner()) {
      clearConfirmation();
      return false;
    }
    clearConfirmation();
    return await signOutNow(openingOwner);
  };
  return {
    confirmOpen,
    confirmationOwner: readonly(confirmationOwner),
    signingOut,
    requestSignOut,
    discardAndSignOut,
    signOutNow,
  };
}
