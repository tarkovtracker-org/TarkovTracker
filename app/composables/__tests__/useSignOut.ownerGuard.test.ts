// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import { effectScope, reactive } from 'vue';
import { useSignOut } from '@/composables/useSignOut';
import { recordLocalSave, setCloudSaveStatus } from '@/stores/tarkov/progressSaveStatus';
const { signOut, toastAdd, user } = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
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
describe('sign-out confirmation owner guard', () => {
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
