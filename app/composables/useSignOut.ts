import { hasUnsavedProgressChanges } from '@/stores/tarkov/progressSaveStatus';
import { logger } from '@/utils/logger';
import { isSupabaseSessionChangedError } from '@/utils/supabaseAuthFence';
/** Shared so any sign-out entry point opens the same confirmation. */
const confirmOpen = ref(false);
const confirmationOwner = ref<string | null>(null);
const clearConfirmation = (): void => {
  confirmOpen.value = false;
  confirmationOwner.value = null;
};
/**
 * `revocation_unavailable`: the server could not be reached and this browser's session is
 * still active, so only an explicit device-only sign-out can end it.
 */
export type SignOutFailure = 'session_changed' | 'revocation_unavailable';
type SignOutOptions = { offerDeviceOnlyFallback?: boolean };
const classifySignOutFailure = (error: unknown): SignOutFailure =>
  isSupabaseSessionChangedError(error) ? 'session_changed' : 'revocation_unavailable';
/**
 * Deliberate sign-out (see `CONTEXT.md`). Global revocation is attempted first. When the
 * server cannot confirm it, the player is told whether this device is signed out, and a
 * device-only sign-out is offered only as an explicit, disclosed choice.
 * Only memory-only changes require confirmation, and the default is to stay signed in.
 */
export function useSignOut() {
  const { $supabase } = useNuxtApp();
  const toast = useToast();
  const { t } = useI18n({ useScope: 'global' });
  const currentOwner = (): string | null => $supabase.user?.id ?? null;
  watch(() => [$supabase.user?.id, $supabase.user?.loggedIn], clearConfirmation, { flush: 'sync' });
  const signingOut = ref(false);
  const lastFailure = ref<SignOutFailure | null>(null);
  const signOutThisDevice = async (expectedUserId: string | null): Promise<boolean> => {
    if (!expectedUserId) return false;
    signingOut.value = true;
    try {
      await $supabase.signOutThisDevice(expectedUserId);
      lastFailure.value = null;
      toast.add({ title: t('app_bar.logout_this_device_done'), color: 'warning' });
      return true;
    } catch (error) {
      logger.error('[SignOut] Device-only sign out failed:', error);
      lastFailure.value = classifySignOutFailure(error);
      toast.add({ title: t('app_bar.logout_failed'), color: 'error' });
      return false;
    } finally {
      signingOut.value = false;
    }
  };
  const deviceOnlyAction = (owner: string) => ({
    label: t('app_bar.logout_this_device'),
    color: 'warning' as const,
    variant: 'solid' as const,
    onClick: () => void signOutThisDevice(owner),
  });
  const canOfferDeviceOnly = (
    failure: SignOutFailure,
    owner: string | null,
    offerFallback: boolean
  ): owner is string => offerFallback && failure === 'revocation_unavailable' && Boolean(owner);
  const reportFailure = (failure: SignOutFailure, owner: string | null, offerFallback: boolean) => {
    if (!canOfferDeviceOnly(failure, owner, offerFallback)) {
      toast.add({ title: t('app_bar.logout_failed'), color: 'error' });
      return;
    }
    toast.add({
      title: t('app_bar.logout_failed'),
      description: t('app_bar.logout_unreachable'),
      color: 'error',
      actions: [deviceOnlyAction(owner)],
    });
  };
  const signOutNow = async (
    expectedUserId = currentOwner(),
    { offerDeviceOnlyFallback = true }: SignOutOptions = {}
  ): Promise<boolean> => {
    signingOut.value = true;
    lastFailure.value = null;
    try {
      const outcome = await $supabase.signOut(expectedUserId ?? undefined);
      if (outcome === 'signed_out_locally') {
        toast.add({ title: t('app_bar.logout_local_only'), color: 'warning' });
      }
      return true;
    } catch (error) {
      logger.error('[SignOut] Sign out failed:', error);
      lastFailure.value = classifySignOutFailure(error);
      reportFailure(lastFailure.value, expectedUserId, offerDeviceOnlyFallback);
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
    lastFailure: readonly(lastFailure),
    requestSignOut,
    discardAndSignOut,
    signOutNow,
    signOutThisDevice,
  };
}
