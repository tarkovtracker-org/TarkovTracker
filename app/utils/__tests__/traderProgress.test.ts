import { describe, expect, it } from 'vitest';
import { actions, defaultState } from '@/stores/progressState';
import { buildPrestigeResetData } from '@/stores/tarkov/prestige';
import { mergeProgressData } from '@/stores/tarkov/progressMerge';
import { sanitizeTraderMap } from '@/utils/progressSanitizers';
import {
  effectiveTraderStanding,
  includeHistoricalQuestInTraderStanding,
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
      expect(mergeProgressData(levelEdit.pvp, saved.pvp).traders.prapor).toEqual({
        level: 2,
        reputation,
      });
      expect(mergeProgressData(saved.pvp, levelEdit.pvp).traders.prapor).toEqual({
        level: 2,
        reputation,
      });
      actions.correctTraderReputation.call(levelEdit, 'prapor', 0);
      expect(mergeProgressData(levelEdit.pvp, saved.pvp).traders.prapor?.reputation).toBe(0);
    }
  );
  it('absorbs earlier EFT recoveries into the same correction across devices', () => {
    const state = structuredClone(defaultState);
    actions.correctTraderReputation.call(state, 'prapor', 0.6);
    const sync = structuredClone(state);
    const checkpoint = state.pvp.traders.prapor!.reputationCheckpoint!.timestamp;
    actions.setTaskComplete.call(state, 'quest-a');
    includeHistoricalQuestInTraderStanding(state.pvp, 'quest-a', checkpoint - 1);
    actions.setTaskComplete.call(sync, 'quest-b');
    includeHistoricalQuestInTraderStanding(sync.pvp, 'quest-b', checkpoint - 1);
    state.pvp = mergeProgressData(state.pvp, sync.pvp);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.6);
    actions.setTaskComplete.call(state, 'quest-c');
    includeHistoricalQuestInTraderStanding(state.pvp, 'quest-c', checkpoint + 1);
    expect(effectiveTraderStanding(state.pvp, catalog).prapor?.reputation).toBe(0.55);
  });
});
