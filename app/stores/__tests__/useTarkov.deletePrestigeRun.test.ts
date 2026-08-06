// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTarkovStore } from '@/stores/useTarkov';
const { deleteMock, eqMock, from, maybeSingleMock, selectMock, supabaseContext } = vi.hoisted(
  () => {
    const eqMock = vi.fn(() => queryBuilder);
    const maybeSingleMock = vi.fn();
    const selectMock = vi.fn(() => ({
      maybeSingle: maybeSingleMock,
    }));
    const queryBuilder = {
      delete: vi.fn(() => queryBuilder),
      eq: eqMock,
      select: selectMock,
    };
    const deleteMock = queryBuilder.delete;
    const from = vi.fn(() => queryBuilder);
    const supabaseContext = {
      user: {
        id: 'user-1' as string | null,
        loggedIn: true,
      },
      client: {
        from,
      },
    };
    return { deleteMock, eqMock, from, maybeSingleMock, selectMock, supabaseContext };
  }
);
mockNuxtImport('useNuxtApp', () => () => ({
  $supabase: supabaseContext,
}));
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
describe('useTarkov deletePrestigeRun', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    supabaseContext.user.loggedIn = true;
    supabaseContext.user.id = 'user-1';
    maybeSingleMock.mockResolvedValue({ data: { id: 'run-1' }, error: null });
  });
  it('deletes the selected archived run for the signed-in user', async () => {
    const store = useTarkovStore();
    await store.deletePrestigeRun('run-1');
    expect(from).toHaveBeenCalledWith('user_prestige_runs');
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(eqMock).toHaveBeenNthCalledWith(1, 'id', 'run-1');
    expect(eqMock).toHaveBeenNthCalledWith(2, 'user_id', 'user-1');
    expect(eqMock).toHaveBeenNthCalledWith(3, 'mode', 'pvp');
    expect(eqMock).toHaveBeenCalledTimes(3);
    expect(selectMock).toHaveBeenCalledWith('id');
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });
  it('rejects when logged out', async () => {
    const store = useTarkovStore();
    supabaseContext.user.loggedIn = false;
    supabaseContext.user.id = null;
    await expect(store.deletePrestigeRun('run-1')).rejects.toThrow(
      'User not logged in. Cannot delete prestige history.'
    );
    expect(from).not.toHaveBeenCalled();
  });
  it('surfaces remote delete failures', async () => {
    const store = useTarkovStore();
    eqMock.mockClear();
    maybeSingleMock.mockClear();
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: 'delete failed' },
    });
    await expect(store.deletePrestigeRun('run-1', 'pve')).rejects.toThrow(
      'Failed to delete prestige history: delete failed'
    );
    expect(eqMock).toHaveBeenNthCalledWith(3, 'mode', 'pve');
    expect(eqMock).toHaveBeenCalledTimes(3);
  });
  it('fails when the delete matches no rows', async () => {
    const store = useTarkovStore();
    eqMock.mockClear();
    maybeSingleMock.mockClear();
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });
    await expect(store.deletePrestigeRun('run-1')).rejects.toThrow(
      'Failed to delete prestige history: no archived run was removed. Apply the delete policy migration to Supabase.'
    );
  });
});
