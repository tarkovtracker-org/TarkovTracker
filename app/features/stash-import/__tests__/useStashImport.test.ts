// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useSupabaseSync, type SupabaseSyncReturn } from '@/composables/supabase/useSupabaseSync';
import { useStashImport } from '@/features/stash-import/useStashImport';
import { defaultState, type UserState } from '@/stores/progressState';
import {
  clearAcknowledgedModes,
  recordAcknowledgedModes,
  noteRemoteProgressApplied,
} from '@/stores/tarkov/acknowledgedModes';
import { sanitizeOwnedProgressData } from '@/utils/progressSanitizers';
import { createDeferred } from '@/utils/test-helpers';
import type { NeededItemTaskObjective, TarkovItem } from '@/types/tarkov';
import type { ObservedTotals } from '@/utils/stashScan/review';
import type { Store } from 'pinia';
const h = vi.hoisted(() => ({
  store: {} as unknown,
  controller: {} as unknown,
  pending: false,
  read: vi.fn(),
  rpc: vi.fn(),
  reconcile: vi.fn(),
  cloudSave: vi.fn(),
  context: { user: { id: 'owner-a', loggedIn: true }, client: {} as unknown },
  metadata: {
    currentGameMode: 'pvp',
    tasksObjectivesHydrated: true,
    hideoutStations: [{ id: 'station', name: 'Station' }],
    getTaskById: (id: string) => ({ id, name: id, minPlayerLevel: 1 }),
  },
}));
mockNuxtImport('useNuxtApp', () => () => ({ $supabase: h.context }));
vi.mock('@/stores/useTarkov', () => ({ useTarkovStore: () => h.store }));
vi.mock('@/stores/useMetadata', () => ({ useMetadataStore: () => h.metadata }));
vi.mock('@/stores/useProgress', () => ({
  useProgressStore: () => ({ taskEvaluations: {}, getTeamIndex: (id: string) => id }),
}));
vi.mock('@/stores/tarkov/progressSaveStatus', () => ({
  hasPendingCloudChanges: () => h.pending,
  retryCloudSave: vi.fn(),
}));
vi.mock('@/stores/tarkov/realtimeListener', () => ({
  getRegisteredSyncController: () => h.controller,
  reconcileRemoteSnapshot: () => h.reconcile(),
}));
vi.mock('@/stores/tarkov/syncTimeline', () => ({ recordLocalSyncTime: vi.fn() }));
vi.mock('@/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const objective = 'a'.repeat(24);
const unrelated = 'b'.repeat(24);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const total: ObservedTotals[] = [{ itemId: 'item', fir: 2, nonFir: 0, unknown: 0 }];
const need = (
  id = objective,
  extra: Partial<NeededItemTaskObjective> = {}
): NeededItemTaskObjective => ({
  id,
  taskId: `quest-${id}`,
  needType: 'taskObjective',
  type: 'giveItem',
  count: 3,
  foundInRaid: false,
  item: { id: 'item' } as TarkovItem,
  ...extra,
});
let state: UserState;
let store: Store<string, UserState> & { notify: () => void };
type Payload = UserState & Record<string, unknown> & { user_id: string };
let controller: SupabaseSyncReturn<UserState, Payload>;
let remote: UserState;
const key = (id = objective) => `taskObjective:${id}`;
const createStore = () => {
  const listeners: Array<(mutation: unknown, next: UserState) => void> = [];
  const result = {
    $state: state,
    get currentGameMode() {
      return state.currentGameMode;
    },
    get pvp() {
      return state.pvp;
    },
    get pve() {
      return state.pve;
    },
    get seasonal() {
      return state.seasonal;
    },
    $subscribe(callback: (mutation: unknown, next: UserState) => void) {
      listeners.push(callback);
      return () => {};
    },
    notify() {
      listeners.forEach((callback) => callback({}, state));
    },
    $patch(callback: (next: UserState) => void) {
      callback(state);
      result.notify();
    },
    getObjectiveCount: (id: string) => state[state.currentGameMode].taskObjectives[id]?.count ?? 0,
    getHideoutPartCount: (id: string) => state[state.currentGameMode].hideoutParts[id]?.count ?? 0,
    isTaskComplete: (id: string) =>
      state[state.currentGameMode].taskCompletions[id]?.complete ?? false,
    isTaskFailed: (id: string) => state[state.currentGameMode].taskCompletions[id]?.failed ?? false,
    isTaskObjectiveComplete: (id: string) =>
      state[state.currentGameMode].taskObjectives[id]?.complete ?? false,
    isHideoutModuleComplete: () => false,
  };
  return result as unknown as typeof store;
};
const applied = () => {
  const progress = copy(remote.pvp);
  progress.taskObjectives[objective] = { count: 2, complete: false, timestamp: 100 };
  return {
    data: { status: 'applied', receipt_id: 'receipt', progress_data: progress },
    error: null,
  };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.read.mockReset();
  h.rpc.mockReset();
  h.reconcile.mockReset();
  h.cloudSave.mockReset();
  clearAcknowledgedModes();
  h.pending = false;
  h.context.user = reactive({ id: 'owner-a', loggedIn: true });
  h.metadata.currentGameMode = 'pvp';
  h.metadata.tasksObjectivesHydrated = true;
  h.metadata.hideoutStations = [{ id: 'station', name: 'Station' }];
  state = reactive(copy(defaultState));
  state.pvp.taskObjectives[unrelated] = { count: 1, timestamp: 1 };
  remote = copy(state);
  store = createStore();
  h.store = store;
  const query = { select: () => query, eq: () => query, maybeSingle: () => h.read() };
  h.context.client = { from: () => query, rpc: (...args: unknown[]) => h.rpc(...args) };
  h.read.mockImplementation(async () => ({
    data: { progress_data: copy(remote.pvp) },
    error: null,
  }));
  h.rpc.mockImplementation(async () => applied());
  h.reconcile.mockResolvedValue(undefined);
  h.cloudSave.mockImplementation(async (payload: UserState) => {
    remote = copy(payload);
    return { error: null };
  });
  controller = useSupabaseSync<UserState, Payload>({
    store,
    table: 'user_progress',
    debounceMs: 5,
    retryDelaysMs: [20, 40],
    transform: (next) => ({ ...copy(next), user_id: h.context.user.id }),
    sync: (payload) => h.cloudSave(payload),
    reconcileBeforeRetry: () => h.reconcile(),
  });
  controller.acknowledgeExternalSave!(copy(state));
  h.controller = controller;
  recordAcknowledgedModes('owner-a', { pvp: state.pvp, pve: state.pve, seasonal: state.seasonal });
});
afterEach(() => {
  controller.cleanup();
  clearAcknowledgedModes();
  vi.useRealTimers();
});
describe('reviewed stash import persistence', () => {
  it('normalizes zero-count catalog requirements through the existing Smart Fill policy', async () => {
    const importer = useStashImport([need(objective, { count: 0 })]);
    expect(importer.targets(total).map((target) => target.key)).toEqual([key()]);
    expect(importer.targets(total)[0]?.need.count).toBe(1);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    expect(preview.changes).toEqual([
      expect.objectContaining({ id: objective, before: 0, count: 1, needed: 1 }),
    ]);
  });
  it('offers receipt recovery when realtime applies the import before its response', async () => {
    const importer = useStashImport([need()]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    h.rpc.mockImplementationOnce(async () => {
      const receipt = applied();
      const imported = copy(receipt.data.progress_data);
      noteRemoteProgressApplied({ remote: { pvp: imported }, applied: { pvp: imported } });
      state.pvp = imported;
      state.pvp.level = 9;
      store.notify();
      return receipt;
    });
    await expect(importer.commit(preview, total, [key()])).rejects.toThrow(
      'stash_import.errors.save_unknown'
    );
    expect(state.pvp.level).toBe(9);
    expect(state.pvp.taskObjectives[objective]?.count).toBe(2);
    h.rpc.mockResolvedValueOnce({ data: { status: 'found' }, error: null });
    expect(await importer.recover(preview)).toBe(true);
    expect(h.reconcile).toHaveBeenCalled();
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      'commit_stash_item_import',
      'get_stash_item_import',
    ]);
    expect(state.pvp.level).toBe(9);
  });
  it('adds screenshot units on top of tracked counts in add mode', async () => {
    state.pvp.taskObjectives[objective] = { count: 1, timestamp: 5 };
    remote = copy(state);
    controller.acknowledgeExternalSave!(copy(state));
    recordAcknowledgedModes('owner-a', {
      pvp: state.pvp,
      pve: state.pve,
      seasonal: state.seasonal,
    });
    const importer = useStashImport([need()]);
    expect(importer.estimate(total, [key()], 'add').changes).toEqual([
      expect.objectContaining({ id: objective, before: 1, count: 3, needed: 3 }),
    ]);
    expect(importer.estimate(total, [key()], 'replace').changes).toEqual([
      expect.objectContaining({ id: objective, before: 1, count: 2 }),
    ]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()], 'add');
    expect(preview.importMode).toBe('add');
    await importer.commit(preview, total, [key()]);
    expect(h.rpc).toHaveBeenCalledWith(
      'commit_stash_item_import',
      expect.objectContaining({ p_updates: [{ id: objective, type: 'task', count: 3, needed: 3 }] })
    );
  });
  it('uses selected-scope Smart Fill and preserves unrelated progress', async () => {
    const importer = useStashImport([need(), need(unrelated)]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    expect(preview.changes).toEqual([
      expect.objectContaining({ id: objective, type: 'task', before: 0, count: 2, needed: 3 }),
    ]);
    await importer.commit(preview, total, [key()]);
    expect(h.rpc).toHaveBeenCalledWith(
      'commit_stash_item_import',
      expect.objectContaining({
        p_expected: remote.pvp,
        p_updates: [{ id: objective, type: 'task', count: 2, needed: 3 }],
      })
    );
    expect(state.pvp.taskObjectives[objective]?.count).toBe(2);
    expect(state.pvp.taskObjectives[unrelated]?.count).toBe(1);
  });
  it('never routes unknown FIR observations to FIR-only objectives', async () => {
    const importer = useStashImport([need(objective, { foundInRaid: true }), need(unrelated)]);
    const unknown = [{ itemId: 'item', fir: 0, nonFir: 0, unknown: 2 }];
    expect(importer.targets(unknown).map((target) => target.key)).toEqual([key(unrelated)]);
    const preview = await importer.prepare('a'.repeat(64), unknown, [key(), key(unrelated)]);
    expect(preview.changes).toEqual([expect.objectContaining({ id: unrelated, count: 2 })]);
  });
  it('keeps confirmed FIR units available when another stack has unknown FIR status', async () => {
    const importer = useStashImport([need(objective, { foundInRaid: true }), need(unrelated)]);
    const mixed = [{ itemId: 'item', fir: 2, nonFir: 0, unknown: 2 }];
    expect(importer.targets(mixed).map((target) => target.key)).toEqual([key(), key(unrelated)]);
    const preview = await importer.prepare('a'.repeat(64), mixed, [key(), key(unrelated)]);
    expect(preview.changes).toEqual([
      expect.objectContaining({ id: objective, count: 2 }),
      expect.objectContaining({ id: unrelated, count: 2 }),
    ]);
  });
  it('does not declare concurrent edits in another mode or metadata saved', async () => {
    const importer = useStashImport([need()]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    const request = createDeferred<ReturnType<typeof applied>>();
    h.rpc.mockReturnValueOnce(request.promise);
    const saving = importer.commit(preview, total, [key()]);
    state.pve.level = 9;
    state.gameEdition = 2;
    store.notify();
    request.resolve(applied());
    await saving;
    expect(controller.hasPendingChanges!()).toBe(true);
    await vi.advanceTimersByTimeAsync(6);
    expect(h.cloudSave).toHaveBeenCalledWith(
      expect.objectContaining({ pve: expect.objectContaining({ level: 9 }), gameEdition: 2 })
    );
  });
  it.each(['owner', 'mode', 'local'] as const)(
    'rejects a stale %s before sending',
    async (change) => {
      const importer = useStashImport([need()]);
      const preview = await importer.prepare('a'.repeat(64), total, [key()]);
      if (change === 'owner') h.context.user.id = 'owner-b';
      if (change === 'mode') state.currentGameMode = 'pve';
      if (change === 'local') state.pvp.level = 9;
      await expect(importer.commit(preview, total, [key()])).rejects.toThrow(
        'stash_import.errors.stale'
      );
      expect(h.rpc).not.toHaveBeenCalled();
    }
  );
  it.each(['owner', 'mode', 'local'] as const)(
    'offers receipt recovery after an in-flight %s change without overwriting newer state',
    async (change) => {
      const importer = useStashImport([need()]);
      const preview = await importer.prepare('a'.repeat(64), total, [key()]);
      const request = createDeferred<ReturnType<typeof applied>>();
      h.rpc.mockReturnValueOnce(request.promise);
      const saving = importer.commit(preview, total, [key()]);
      if (change === 'owner') h.context.user.id = 'owner-b';
      if (change === 'mode') state.currentGameMode = 'pve';
      if (change === 'local') state.pvp.level = 9;
      request.resolve(applied());
      await expect(saving).rejects.toThrow('stash_import.errors.save_unknown');
      expect(state.pvp.taskObjectives[objective]).toBeUndefined();
    }
  );
  it('checks catalog scope again before the import is sent', async () => {
    const importer = useStashImport([need()]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    h.metadata.currentGameMode = 'pve';
    await expect(importer.commit(preview, total, [key()])).rejects.toThrow(
      'stash_import.errors.catalog_loading'
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('requires hideout metadata both before preview and before committing it', async () => {
    const importer = useStashImport([need()]);
    const stations = h.metadata.hideoutStations;
    h.metadata.hideoutStations = [];
    await expect(importer.prepare('a'.repeat(64), total, [key()])).rejects.toThrow(
      'stash_import.errors.catalog_loading'
    );
    expect(h.read).not.toHaveBeenCalled();
    h.metadata.hideoutStations = stations;
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    h.metadata.hideoutStations = [];
    await expect(importer.commit(preview, total, [key()])).rejects.toThrow(
      'stash_import.errors.catalog_loading'
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it.each(['complete', 'failed', 'objective', 'teammate', 'pooled'] as const)(
    'excludes %s task targets',
    (kind) => {
      const candidate = need();
      const configure = {
        complete: () => {
          state.pvp.taskCompletions[candidate.taskId] = { complete: true, timestamp: 1 };
        },
        failed: () => {
          state.pvp.taskCompletions[candidate.taskId] = { failed: true, timestamp: 1 };
        },
        objective: () => {
          state.pvp.taskObjectives[objective] = { complete: true, timestamp: 1 };
        },
        teammate: () => {
          candidate.teamId = 'other';
        },
        pooled: () => {
          candidate.acceptedItems = [{ id: 'item' }, { id: 'other' }] as TarkovItem[];
        },
      };
      configure[kind]();
      expect(useStashImport([candidate]).targets(total)).toEqual([]);
    }
  );
  it.each(['conflict', 'duplicate'] as const)(
    'reconciles before later saves after a %s response',
    async (status) => {
      const importer = useStashImport([need()]);
      const preview = await importer.prepare('a'.repeat(64), total, [key()]);
      h.rpc.mockResolvedValueOnce({
        data: { status, receipt_id: 'existing', progress_data: remote.pvp },
        error: null,
      });
      expect((await importer.commit(preview, total, [key()])).status).toBe(status);
      expect(state.pvp.taskObjectives[objective]).toBeUndefined();
      h.reconcile.mockRejectedValueOnce(new Error('offline'));
      state.pvp.level = 8;
      store.notify();
      await controller.syncToSupabase();
      expect(h.reconcile).toHaveBeenCalled();
      expect(h.cloudSave).not.toHaveBeenCalled();
    }
  );
  it.each(['commit', 'recover'] as const)(
    'reports rate limiting for %s without claiming an unknown save',
    async (operation) => {
      const importer = useStashImport([need()]);
      const preview = await importer.prepare('a'.repeat(64), total, [key()]);
      h.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'PT429', message: 'Stash item import rate limit exceeded' },
      });
      const request =
        operation === 'commit'
          ? importer.commit(preview, total, [key()])
          : importer.recover(preview);
      await expect(request).rejects.toThrow('stash_import.errors.rate_limited');
      expect(state.pvp.taskObjectives[objective]).toBeUndefined();
      expect(h.rpc).toHaveBeenCalledOnce();
    }
  );
  it('keeps uncertain writes behind reconciliation and recovers via receipt without resending', async () => {
    const importer = useStashImport([need()]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    h.rpc.mockResolvedValueOnce({ data: null, error: new Error('response lost') });
    await expect(importer.commit(preview, total, [key()])).rejects.toThrow(
      'stash_import.errors.save_unknown'
    );
    h.reconcile.mockRejectedValueOnce(new Error('offline'));
    await controller.syncToSupabase();
    expect(h.cloudSave).not.toHaveBeenCalled();
    h.rpc.mockResolvedValueOnce({
      data: {
        status: 'found',
        receipt_id: preview.importId,
        progress_data: applied().data.progress_data,
      },
      error: null,
    });
    await expect(importer.recover(preview)).resolves.toBe(true);
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      'commit_stash_item_import',
      'get_stash_item_import',
    ]);
    expect(state.pvp.taskObjectives[objective]).toBeUndefined();
  });
  it('reconciles even a missing receipt before normal saves resume', async () => {
    const importer = useStashImport([need()]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    h.rpc.mockResolvedValueOnce({
      data: { status: 'missing', receipt_id: null, progress_data: remote.pvp },
      error: null,
    });
    await expect(importer.recover(preview)).resolves.toBe(false);
    expect(h.reconcile).toHaveBeenCalledOnce();
  });
  it.each(['owner', 'mode'] as const)(
    'rejects a recovery whose %s changes while its receipt loads',
    async (change) => {
      const importer = useStashImport([need()]);
      const preview = await importer.prepare('a'.repeat(64), total, [key()]);
      const request = createDeferred<{ data: { status: string }; error: null }>();
      h.rpc.mockReturnValueOnce(request.promise);
      const recovery = importer.recover(preview);
      if (change === 'owner') h.context.user.id = 'owner-b';
      if (change === 'mode') state.currentGameMode = 'pve';
      request.resolve({ data: { status: 'found' }, error: null });
      await expect(recovery).rejects.toThrow('stash_import.errors.stale');
      expect(h.reconcile).not.toHaveBeenCalled();
    }
  );
  it('rejects an owner change while the preview baseline is loading', async () => {
    const request = createDeferred<{ data: { progress_data: UserState['pvp'] }; error: null }>();
    h.read.mockReturnValueOnce(request.promise);
    const importer = useStashImport([need()]);
    const preparing = importer.prepare('a'.repeat(64), total, [key()]);
    h.context.user.id = 'owner-b';
    request.resolve({ data: { progress_data: remote.pvp }, error: null });
    await expect(preparing).rejects.toThrow('stash_import.errors.stale');
  });
  it('refuses pending local progress without uploading it during preparation', async () => {
    h.pending = true;
    const importer = useStashImport([need()]);
    await expect(importer.prepare('a'.repeat(64), total, [key()])).rejects.toThrow(
      'stash_import.errors.unsynced'
    );
    expect(h.read).not.toHaveBeenCalled();
  });
  it('allows an absent row only against canonical local defaults', async () => {
    state.pvp = copy(defaultState.pvp);
    h.read.mockResolvedValueOnce({ data: null, error: null });
    const importer = useStashImport([need()]);
    expect((await importer.prepare('a'.repeat(64), total, [key()])).expected).toBeNull();
    state.pvp.level = 5;
    h.read.mockResolvedValueOnce({ data: null, error: null });
    await expect(importer.prepare('a'.repeat(64), total, [key()])).rejects.toThrow(
      'stash_import.errors.unsynced'
    );
  });
  it('does not reset the store for a malformed successful response', async () => {
    const importer = useStashImport([need()]);
    const preview = await importer.prepare('a'.repeat(64), total, [key()]);
    h.rpc.mockResolvedValueOnce({
      data: { status: 'applied', receipt_id: 'bad', progress_data: null },
      error: null,
    });
    await expect(importer.commit(preview, total, [key()])).rejects.toThrow(
      'stash_import.errors.save_unknown'
    );
    expect(sanitizeOwnedProgressData(state.pvp)).toEqual(preview.local);
  });
});
