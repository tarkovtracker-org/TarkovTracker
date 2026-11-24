// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { createAccountModifierPlan } from '@/features/seasonal-modifiers/accountModifierPlan';
import { readModifierPlanCandidate } from '@/features/seasonal-modifiers/modifierPlanStorage';
import { seasonTwoModifiersStorageKey } from '@/utils/storageKeys';
let effects: ReturnType<typeof effectScope>;
const perk = 'preview:untar-control:prodigy';
const drawback = 'preview:untar-control:deadline';
function openAccount(owner = ref<string | null>('owner')) {
  const repo = {
    read: vi.fn<(id: string) => Promise<string[] | null>>().mockResolvedValue(null),
    initialize: vi
      .fn<(id: string, ids: string[]) => Promise<string[] | null>>()
      .mockImplementation(async (_id, ids) => ids),
    save: vi.fn<(id: string, ids: string[]) => Promise<void>>().mockResolvedValue(undefined),
  };
  const plan = effects.run(() =>
    createAccountModifierPlan(owner, repo, readModifierPlanCandidate)
  )!;
  return { owner, repo, plan };
}
beforeEach(() => {
  effects = effectScope();
});
afterEach(() => {
  effects.stop();
  localStorage.clear();
});
describe('account modifier plans', () => {
  it('uses a guest plan only when no account plan exists, including an explicitly empty plan', async () => {
    localStorage.setItem(seasonTwoModifiersStorageKey(null), JSON.stringify([perk]));
    const { plan, repo } = openAccount();
    repo.read.mockResolvedValueOnce([]);
    await plan.load();
    expect(plan.modifierIds.value).toEqual([]);
    expect(repo.initialize).not.toHaveBeenCalled();
    await plan.load();
    expect(repo.initialize).toHaveBeenCalledWith('owner', [perk]);
    expect(plan.modifierIds.value).toEqual([perk]);
  });
  it('keeps the winning cloud plan if another browser creates it during import', async () => {
    localStorage.setItem(seasonTwoModifiersStorageKey(null), JSON.stringify([perk]));
    const { plan, repo } = openAccount();
    repo.initialize.mockResolvedValueOnce([drawback]);
    await plan.load();
    expect(plan.modifierIds.value).toEqual([drawback]);
  });
  it('prefers a legacy plan addressed to that owner, never a different owner’s plan', async () => {
    const { owner, plan, repo } = openAccount();
    localStorage.setItem(seasonTwoModifiersStorageKey('owner'), JSON.stringify([perk]));
    localStorage.setItem(seasonTwoModifiersStorageKey(null), JSON.stringify([drawback]));
    await plan.load();
    expect(plan.modifierIds.value).toEqual([perk]);
    owner.value = 'other';
    await plan.load();
    expect(repo.initialize).toHaveBeenLastCalledWith('other', [drawback]);
    expect(plan.modifierIds.value).toEqual([drawback]);
  });
  it('does not import or accept edits until the cloud load succeeds', async () => {
    localStorage.setItem(seasonTwoModifiersStorageKey(null), JSON.stringify([perk]));
    const { plan, repo } = openAccount();
    repo.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([drawback]);
    await plan.load();
    expect(plan.status.value).toBe('error');
    expect(repo.initialize).not.toHaveBeenCalled();
    plan.save([perk]);
    expect(repo.save).not.toHaveBeenCalled();
    await plan.load();
    expect(plan.status.value).toBe('ready');
    expect(plan.modifierIds.value).toEqual([drawback]);
  });
  it('ignores a stale read from an account that signed out before import', async () => {
    const { owner, plan, repo } = openAccount();
    const read = Promise.withResolvers<string[] | null>();
    repo.read.mockReturnValueOnce(read.promise);
    localStorage.setItem(seasonTwoModifiersStorageKey(null), JSON.stringify([perk]));
    const loading = plan.load();
    owner.value = 'other';
    repo.read.mockResolvedValueOnce([drawback]);
    await plan.load();
    read.resolve(null);
    await loading;
    expect(repo.initialize).not.toHaveBeenCalled();
    expect(plan.modifierIds.value).toEqual([drawback]);
  });
  it('serializes rapid edits, saves the final empty plan, and restores it in a fresh browser', async () => {
    const first = openAccount();
    await first.plan.load();
    const write = Promise.withResolvers<undefined>();
    first.repo.save.mockReturnValueOnce(write.promise);
    first.plan.save([perk]);
    first.plan.save([perk, drawback]);
    first.plan.save([]);
    expect(first.repo.save.mock.calls).toEqual([['owner', [perk]]]);
    write.resolve(undefined);
    await flushPromises();
    expect(first.repo.save.mock.calls).toEqual([
      ['owner', [perk]],
      ['owner', []],
    ]);
    const second = openAccount();
    localStorage.setItem(seasonTwoModifiersStorageKey(null), JSON.stringify([drawback]));
    second.repo.read.mockResolvedValueOnce(first.repo.save.mock.lastCall![1]);
    await second.plan.load();
    expect(second.plan.modifierIds.value).toEqual([]);
    expect(second.repo.initialize).not.toHaveBeenCalled();
  });
  it('retries the latest draft after a failed write and ignores stale results on account changes', async () => {
    const { owner, plan, repo } = openAccount();
    await plan.load();
    const write = Promise.withResolvers<undefined>();
    repo.save.mockReturnValueOnce(write.promise);
    plan.save([perk]);
    plan.save([drawback]);
    write.reject(new Error('offline'));
    await flushPromises();
    expect(plan.saveFailed.value).toBe(true);
    expect(plan.modifierIds.value).toEqual([drawback]);
    const retryWrite = Promise.withResolvers<undefined>();
    repo.save.mockReturnValueOnce(retryWrite.promise);
    const saving = plan.retrySave();
    expect(repo.save).toHaveBeenLastCalledWith('owner', [drawback]);
    owner.value = 'other';
    repo.read.mockResolvedValueOnce([perk]);
    await plan.load();
    retryWrite.reject(new Error('old account'));
    await saving;
    expect(plan.modifierIds.value).toEqual([perk]);
    expect(plan.saveFailed.value).toBe(false);
    expect(plan.saving.value).toBe(false);
  });
});
