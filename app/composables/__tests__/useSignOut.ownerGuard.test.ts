// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, reactive } from 'vue';
import { useSignOut } from '@/composables/useSignOut';
import { recordLocalSave, setCloudSaveStatus } from '@/stores/tarkov/progressSaveStatus';
const { signOut, toastAdd, user } = vi.hoisted(() => ({
  signOut: vi.fn(async (_expectedUserId?: string) => undefined),
  toastAdd: vi.fn(),
  user: { id: 'owner-a' as string | null, loggedIn: true },
}));
const reactiveUser = reactive(user);
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: { signOut, user: reactiveUser } }));
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
    signOut.mockResolvedValue(undefined);
  });
  it('keeps the initiating owner when another account signs in during initialization', async () => {
    const initialization = createDeferred<null>();
    const authSignOut = vi.fn();
    signOut.mockImplementation(async (expectedUserId) => {
      await initialization.promise;
      if (expectedUserId && reactiveUser.id === expectedUserId) authSignOut();
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
