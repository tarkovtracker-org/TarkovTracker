import { describe, expect, it } from 'vitest';
import { actions, defaultState } from '@/stores/progressState';
import { buildPrestigeResetData } from '@/stores/tarkov/prestige';
import { mergeProgressData } from '@/stores/tarkov/progressMerge';
import { sanitizeTaskCompletionMap, sanitizeTraderMap } from '@/utils/progressSanitizers';
import {
  effectiveTraderStanding,
  checkpointLegacyTraderStanding,
  traderCatalogForMode,
} from '@/utils/traderProgress';
import type { Task, Trader } from '@/types/tarkov';
const prapor: Trader = {
  id: 'prapor',
  name: 'Prapor',
  normalizedName: 'prapor',
  levels: [
    { id: 'll3', level: 3, requiredPlayerLevel: 20, requiredReputation: 0.3, requiredCommerce: 0 },
    { id: 'll2', level: 2, requiredPlayerLevel: 10, requiredReputation: 0.3, requiredCommerce: 0 },
    { id: 'll4', level: 4, requiredPlayerLevel: 20, requiredReputation: 0.3, requiredCommerce: 10 },
  ],
};
const fence: Trader = { ...prapor, id: 'fence', name: 'Fence', normalizedName: 'fence' };
const catalog = {
  traders: [prapor, fence],
  tasks: [
    {
      id: 'quest-a',
      trader: fence,
      finishRewards: { traderStanding: [{ trader: prapor, standing: 0.1 }] },
    },
    {
      id: 'quest-b',
      finishRewards: {
        traderStanding: [
          { trader: prapor, standing: 0.2 },
          { trader: fence, standing: -0.15 },
        ],
      },
    },
    {
      id: 'quest-c',
      finishRewards: { traderStanding: [{ trader: prapor, standing: -0.05 }] },
    },
  ] satisfies Task[],
};
describe('effective trader standing', () => {
  it('keeps an existing manual LL2 even when current standing qualifies for LL3', () => {
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pvp.traders.prapor = { level: 2, reputation: 0.6 };
    expect(effectiveTraderStanding(state.pvp, catalog).prapor).toEqual({
      level: 2,
      reputation: 0.6,
    });
  });
  it('switches to Auto and preserves a later lower manual choice across sync and reload', () => {
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    state.pvp.traders.prapor = { level: 2, reputation: 0.6 };
    actions.setTraderLoyaltyAuto.call(state, 'prapor');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.level).toBe(3);
    const earlier = structuredClone(state.pvp);
    actions.setTraderLevel.call(state, 'prapor', 1);
    state.pvp.traders = sanitizeTraderMap(state.pvp.traders);
    state.pvp = mergeProgressData(state.pvp, earlier);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor).toEqual({
      level: 1,
      reputation: 0.6,
    });
  });
  it('defaults a reputation-only correction to Auto and can pause quest changes until re-enabled', () => {
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    actions.correctTraderReputation.call(state, 'prapor', 0.3);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.level).toBe(3);
    actions.setQuestReputationTracking.call(state, 'prapor', 0.3, false);
    const paused = structuredClone(state.pvp);
    actions.setTaskComplete.call(state, 'quest-a');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.3);
    actions.correctTraderReputation.call(state, 'prapor', 0.2);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor).toEqual({
      level: 1,
      reputation: 0.2,
    });
    actions.setQuestReputationTracking.call(state, 'prapor', 0.2, true);
    state.pvp.traders = sanitizeTraderMap(state.pvp.traders);
    state.pvp = mergeProgressData(state.pvp, paused);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.2);
    actions.setTaskUncompleted.call(state, 'quest-a');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.2);
    actions.setTaskComplete.call(state, 'quest-b');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor).toEqual({
      level: 3,
      reputation: 0.4,
    });
    actions.setTaskUncompleted.call(state, 'quest-b');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor).toEqual({
      level: 1,
      reputation: 0.2,
    });
  });
  it('keeps the resumed tracking policy when correcting the displayed reputation', () => {
    const state = structuredClone(defaultState);
    actions.setQuestReputationTracking.call(state, 'prapor', 0.3, false);
    actions.setTaskComplete.call(state, 'quest-a');
    actions.setQuestReputationTracking.call(state, 'prapor', 0.3, true);
    actions.correctTraderReputation.call(state, 'prapor', 0.5);
    actions.setTaskUncompleted.call(state, 'quest-a');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.5);
  });
  it('merges a manual loyalty choice independently of a reputation edit on another device', () => {
    const state = structuredClone(defaultState);
    state.pvp.level = 20;
    actions.correctTraderReputation.call(state, 'prapor', 0.4);
    const other = structuredClone(state);
    actions.setTraderLevel.call(state, 'prapor', 2);
    actions.setQuestReputationTracking.call(other, 'prapor', 0.6, false);
    const merged = mergeProgressData(state.pvp, other.pvp);
    expect(merged.traders.prapor?.reputationCheckpoint?.questRewardTracking).toBe('paused');
    expect(effectiveTraderStanding(merged, catalog).prapor).toEqual({ level: 2, reputation: 0.6 });
  });
  it('derives signed rewards from successful quest IDs once across repeats, merges and undo', () => {
    const state = structuredClone(defaultState);
    const importer = structuredClone(defaultState);
    actions.setTaskComplete.call(state, 'quest-a');
    actions.setTaskComplete.call(importer, 'quest-a');
    actions.setTaskComplete.call(importer, 'quest-b');
    state.pvp = mergeProgressData(state.pvp, importer.pvp);
    actions.setTaskComplete.call(state, 'quest-b');
    actions.setTaskFailed.call(state, 'quest-c', { manual: true });
    expect(effectiveTraderStanding(state.pvp, catalog)).toEqual({
      prapor: { level: 1, reputation: 0.3 },
      fence: { level: 1, reputation: -0.15 },
    });
    actions.setTaskUncompleted.call(state, 'quest-b');
    expect(effectiveTraderStanding(state.pvp, catalog)).toEqual({
      prapor: { level: 1, reputation: 0.1 },
      fence: { level: 1, reputation: 0 },
    });
  });
  it('uses both live thresholds, preserves recorded loyalty and isolates mode and prestige', () => {
    const state = structuredClone(defaultState);
    actions.setTaskComplete.call(state, 'quest-a');
    actions.setTaskComplete.call(state, 'quest-b');
    state.pvp.level = 10;
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.level).toBe(2);
    state.pvp.level = 20;
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.level).toBe(3);
    actions.setTaskComplete.call(state, 'quest-c');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.level).toBe(1);
    actions.setTraderLevel.call(state, 'prapor', 2);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.level).toBe(2);
    const metadata = { ...catalog, tasksCoreGameMode: 'pvp', tasksRewardsGameMode: 'pvp' } as const;
    expect(traderCatalogForMode(metadata, 'pvp')).toBe(metadata);
    expect(traderCatalogForMode(metadata, 'pve')).toBeUndefined();
    expect(traderCatalogForMode({ ...metadata, tasksCoreGameMode: 'pve' }, 'pvp')).toBeUndefined();
    expect(effectiveTraderStanding(state.pve, catalog).prapor?.reputation).toBe(0);
    expect(effectiveTraderStanding(buildPrestigeResetData(state.pvp, 1), catalog).prapor).toEqual({
      level: 1,
      reputation: 0,
    });
  });
  it('keeps a lower manual correction through sync, repeat import and later signed updates', () => {
    const state = structuredClone(defaultState);
    actions.setTaskComplete.call(state, 'quest-a');
    actions.correctTraderReputation.call(state, 'prapor', 0.9);
    const earlier = structuredClone(state.pvp);
    actions.correctTraderReputation.call(state, 'prapor', 0.25);
    state.pvp.traders = sanitizeTraderMap(state.pvp.traders);
    state.pvp = mergeProgressData(state.pvp, earlier);
    actions.setTaskComplete.call(state, 'quest-a');
    actions.setTraderReputation.call(state, 'prapor', 1);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.25);
    actions.setTaskComplete.call(state, 'quest-c');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.2);
    actions.setTaskUncompleted.call(state, 'quest-c');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.25);
  });
  it('preserves a legacy balance and starts counting from the next quest change', () => {
    const state = structuredClone(defaultState);
    state.pvp.traders.prapor = { level: 2, reputation: 0.6 };
    state.pvp.taskCompletions['quest-a'] = { complete: true, failed: false };
    expect(effectiveTraderStanding(state.pvp, catalog).prapor).toEqual({
      level: 2,
      reputation: 0.6,
    });
    actions.setTaskComplete.call(state, 'quest-b');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.8);
    actions.setTaskUncompleted.call(state, 'quest-b');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.6);
  });
  it.each([0.5, -0.5])(
    'keeps legacy reputation %s when another device only edits loyalty',
    (reputation) => {
      const levelEdit = structuredClone(defaultState);
      const saved = structuredClone(defaultState);
      actions.setTraderLevel.call(levelEdit, 'prapor', 2);
      saved.pvp.traders.prapor = { level: 1, reputation };
      expect(mergeProgressData(levelEdit.pvp, saved.pvp).traders.prapor).toMatchObject({
        level: 2,
        reputation,
      });
      expect(mergeProgressData(saved.pvp, levelEdit.pvp).traders.prapor).toMatchObject({
        level: 2,
        reputation,
      });
      actions.correctTraderReputation.call(levelEdit, 'prapor', 0);
      expect(mergeProgressData(levelEdit.pvp, saved.pvp).traders.prapor?.reputation).toBe(0);
    }
  );
  it('preserves a correction when another device imports an older completion before either syncs', () => {
    const state = structuredClone(defaultState);
    const sync = structuredClone(state);
    actions.correctTraderReputation.call(state, 'prapor', 0.6);
    const checkpoint = state.pvp.traders.prapor!.reputationCheckpoint!.timestamp;
    actions.setTaskComplete.call(sync, 'quest-b');
    actions.recordEftQuestCompletionTime.call(sync, 'quest-b', checkpoint - 1);
    sync.pvp.taskCompletions = sanitizeTaskCompletionMap(sync.pvp.taskCompletions);
    expect(
      effectiveTraderStanding(mergeProgressData(sync.pvp, state.pvp), catalog).prapor?.reputation
    ).toBe(0.6);
    state.pvp = mergeProgressData(state.pvp, sync.pvp);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.6);
    actions.setTaskComplete.call(state, 'quest-c');
    actions.recordEftQuestCompletionTime.call(state, 'quest-c', checkpoint + 1);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.55);
    actions.setTaskUncompleted.call(state, 'quest-b');
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.35);
    actions.correctTraderReputation.call(state, 'prapor', 0.4);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.4);
  });
  it('keeps the included history of both devices when migrating the same saved standing', () => {
    const state = structuredClone(defaultState);
    state.pvp.traders.prapor = { level: 2, reputation: 0.6 };
    const other = structuredClone(state);
    state.pvp.taskCompletions['quest-a'] = { complete: true };
    other.pvp.taskCompletions['quest-b'] = { complete: true };
    checkpointLegacyTraderStanding(state.pvp);
    checkpointLegacyTraderStanding(other.pvp);
    expect(
      effectiveTraderStanding(mergeProgressData(state.pvp, other.pvp), catalog).prapor?.reputation
    ).toBe(0.6);
  });
});
