// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, reactive } from 'vue';
import { useSignOut } from '@/composables/useSignOut';
import { recordLocalSave, setCloudSaveStatus } from '@/stores/tarkov/progressSaveStatus';
const { signOut, signOutThisDevice, toastAdd, user } = vi.hoisted(() => ({
  signOut: vi.fn(
    async (_expectedUserId?: string): Promise<'signed_out' | 'signed_out_locally'> => 'signed_out'
  ),
  signOutThisDevice: vi.fn(async (_expectedUserId: string) => undefined),
  toastAdd: vi.fn(),
  user: { id: 'owner-a' as string | null, loggedIn: true },
}));
const reactiveUser = reactive(user);
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: { signOut, signOutThisDevice, user: reactiveUser },
}));
mockNuxtImport('useToast', () => () => ({ add: toastAdd }));
vi.mock('vue-i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};
describe('sign-out confirmation owner guard', () => {
  beforeEach(() => {
    reactiveUser.id = 'owner-a';
    reactiveUser.loggedIn = true;
    recordLocalSave(true);
    setCloudSaveStatus({ state: 'idle', failure: null, retryAttempt: 0, nextRetryAt: null });
    signOut.mockReset();
    signOut.mockResolvedValue('signed_out');
    signOutThisDevice.mockReset();
    signOutThisDevice.mockResolvedValue(undefined);
    toastAdd.mockReset();
  });
  it('keeps the initiating owner when another account signs in during initialization', async () => {
    const initialization = createDeferred<null>();
    const authSignOut = vi.fn();
    signOut.mockImplementation(async (expectedUserId) => {
      await initialization.promise;
      if (expectedUserId && reactiveUser.id === expectedUserId) authSignOut();
      return 'signed_out';
    });
    const flow = useSignOut();
    const request = flow.requestSignOut();
    expect(signOut).toHaveBeenCalledWith('owner-a');
    reactiveUser.id = 'owner-b';
    initialization.resolve(null);
    await expect(request).resolves.toBe(true);
    expect(authSignOut).not.toHaveBeenCalled();
  });
  it('rejects a stale discard after its route scope is disposed and another account signs in', async () => {
    recordLocalSave(false, 'quota');
    setCloudSaveStatus({ state: 'failed', failure: 'offline', retryAttempt: 3, nextRetryAt: null });
    const scope = effectScope();
    const flow = scope.run(() => useSignOut())!;
    await expect(flow.requestSignOut()).resolves.toBe(false);
    expect(flow.confirmOpen.value).toBe(true);
    scope.stop();
    reactiveUser.id = 'owner-b';
    await expect(flow.discardAndSignOut('owner-a')).resolves.toBe(false);
    expect(flow.confirmOpen.value).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });
});
describe('sign-out without server confirmation', () => {
  beforeEach(() => {
    reactiveUser.id = 'owner-a';
    reactiveUser.loggedIn = true;
    recordLocalSave(true);
    setCloudSaveStatus({ state: 'idle', failure: null, retryAttempt: 0, nextRetryAt: null });
    signOut.mockReset();
    signOutThisDevice.mockReset();
    signOutThisDevice.mockResolvedValue(undefined);
    toastAdd.mockReset();
  });
  it('discloses a local-only sign-out when the server could not confirm revocation', async () => {
    signOut.mockResolvedValue('signed_out_locally');
    const flow = useSignOut();
    await expect(flow.signOutNow('owner-a')).resolves.toBe(true);
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'app_bar.logout_local_only', color: 'warning' })
    );
  });
  it('offers an explicit device-only sign-out when the session could not be ended', async () => {
    signOut.mockRejectedValue(new Error('Failed to fetch'));
    const flow = useSignOut();
    await expect(flow.signOutNow('owner-a')).resolves.toBe(false);
    expect(flow.lastFailure.value).toBe('revocation_unavailable');
    expect(signOutThisDevice).not.toHaveBeenCalled();
    const toast = toastAdd.mock.calls[0]![0] as {
      description?: string;
      actions?: { label: string; onClick: () => void }[];
    };
    expect(toast.description).toBe('app_bar.logout_unreachable');
    expect(toast.actions).toHaveLength(1);
    expect(toast.actions![0]!.label).toBe('app_bar.logout_this_device');
    toast.actions![0]!.onClick();
    await vi.waitFor(() => expect(signOutThisDevice).toHaveBeenCalledWith('owner-a'));
    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: 'app_bar.logout_this_device_done' })
      )
    );
  });
  it('does not offer the device-only path when another account took over', async () => {
    const changed = new Error('Supabase session changed before sign-out');
    changed.name = 'SupabaseSessionChangedError';
    signOut.mockRejectedValue(changed);
    const flow = useSignOut();
    await expect(flow.signOutNow('owner-a')).resolves.toBe(false);
    expect(flow.lastFailure.value).toBe('session_changed');
    expect(toastAdd).toHaveBeenCalledWith({ title: 'app_bar.logout_failed', color: 'error' });
  });
  it('lets callers handle the device-only choice themselves', async () => {
    signOut.mockRejectedValue(new Error('Failed to fetch'));
    const flow = useSignOut();
    await flow.signOutNow('owner-a', { offerDeviceOnlyFallback: false });
    expect(toastAdd).toHaveBeenCalledWith({ title: 'app_bar.logout_failed', color: 'error' });
  });
  it('reports a failed device-only sign-out and never runs it without an owner', async () => {
    const flow = useSignOut();
    await expect(flow.signOutThisDevice(null)).resolves.toBe(false);
    expect(signOutThisDevice).not.toHaveBeenCalled();
    signOutThisDevice.mockRejectedValue(new Error('storage blocked'));
    await expect(flow.signOutThisDevice('owner-a')).resolves.toBe(false);
    expect(flow.lastFailure.value).toBe('revocation_unavailable');
    expect(toastAdd).toHaveBeenCalledWith({ title: 'app_bar.logout_failed', color: 'error' });
  });
});
