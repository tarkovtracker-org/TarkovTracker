import { describe, expect, it } from 'vitest';
import { resolveTraderUnlock } from '@/features/dashboard/traderLockStatus';
import { GAME_MODES, TASK_ID_REGISTRY } from '@/utils/constants';
import type { LockTrader, TraderLockStatusDeps } from '@/features/dashboard/traderLockStatus';
const RAGMAN = { id: 'ragman-id', normalizedName: 'ragman' };
const PEACEKEEPER = { id: 'peacekeeper-id', normalizedName: 'peacekeeper' };
const PRAPOR = { id: 'prapor-id', normalizedName: 'prapor' };
const JAEGER = { id: 'jaeger-id', normalizedName: 'jaeger' };
const TOUR = {
  id: 'tour',
  name: 'Tour',
  traderUnlocks: [
    { id: RAGMAN.id, name: 'Ragman' },
    { id: PEACEKEEPER.id, name: 'Peacekeeper' },
    { id: PRAPOR.id, name: 'Prapor' },
  ],
};
const BOREAS = { id: 'boreas', name: 'Boreas', traderUnlocks: [] };
const storyGate = (chapter: { id: string; name: string }, objectiveId: string, name: string) => ({
  id: `overlay.${objectiveId}`,
  type: 'storyObjective' as const,
  storyChapter: { id: chapter.id, name: chapter.name },
  objective: { id: objectiveId, name },
});
const ragmanTask = {
  id: 'ragman-task',
  name: 'Only Business',
  trader: { id: RAGMAN.id },
  otherRequirements: [storyGate(TOUR, 'talk-to-ragman', 'Talk to Ragman')],
};
const praporBoreasTask = {
  id: 'prapor-boreas-task',
  name: 'Late Prapor Task',
  trader: { id: PRAPOR.id },
  otherRequirements: [storyGate(BOREAS, 'ask-mechanic', 'Ask Mechanic for help')],
};
const introduction = {
  id: 'introduction',
  name: 'Introduction',
  trader: { id: 'mechanic-id' },
  finishRewards: { traderUnlock: [JAEGER.id] as unknown as { id: string; name: string } },
};
const createDeps = (overrides: Partial<TraderLockStatusDeps> = {}): TraderLockStatusDeps => ({
  tasks: [
    { id: TASK_ID_REGISTRY.GETTING_ACQUAINTED, name: 'Getting Acquainted' },
    { id: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP, name: 'Easy Money - Part 1' },
    ragmanTask,
    praporBoreasTask,
    introduction,
  ],
  isTaskComplete: () => false,
  gameMode: GAME_MODES.PVP,
  storyChapters: [TOUR, BOREAS],
  isStoryObjectiveComplete: () => false,
  isStoryChapterComplete: () => false,
  getTraderLevel: () => 1,
  getTraderReputation: () => 0,
  ...overrides,
});
const resolve = (trader: LockTrader, overrides: Partial<TraderLockStatusDeps> = {}) =>
  resolveTraderUnlock(trader, createDeps(overrides));
describe('resolveTraderUnlock', () => {
  describe('task unlocks', () => {
    it('returns null for traders with no unlock source', () => {
      expect(resolve({ id: 'skier-id', normalizedName: 'skier' })).toBeNull();
    });
    it('names the configured unlock task until it is complete', () => {
      const trader = { id: 'lk-id', normalizedName: 'lightkeeper' };
      expect(resolve(trader)).toEqual({
        kind: 'task',
        task: { id: TASK_ID_REGISTRY.GETTING_ACQUAINTED, name: 'Getting Acquainted' },
      });
      expect(
        resolve(trader, { isTaskComplete: (id) => id === TASK_ID_REGISTRY.GETTING_ACQUAINTED })
      ).toBeNull();
    });
    it('assumes a configured trader is locked while metadata tasks load', () => {
      const trader = { id: 'lk-id', normalizedName: 'lightkeeper' };
      expect(resolve(trader, { tasks: [] })).toEqual({ kind: 'task', task: null });
      expect(resolve(trader, { tasks: null })).toEqual({ kind: 'task', task: null });
      expect(resolve(PRAPOR, { tasks: undefined })).toBeNull();
    });
    it('resolves the ref unlock task by game mode', () => {
      const ref = { id: 'ref-id', normalizedName: 'ref' };
      const pveTask = { id: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVE, name: 'Easy Money - Part 1' };
      expect(resolve(ref)).toEqual({
        kind: 'task',
        task: { id: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP, name: 'Easy Money - Part 1' },
      });
      expect(
        resolve(ref, { isTaskComplete: (id) => id === TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP })
      ).toBeNull();
      expect(
        resolve(ref, { gameMode: GAME_MODES.PVE, tasks: [...createDeps().tasks!, pveTask] })
      ).toEqual({ kind: 'task', task: pveTask });
    });
    it('reads trader unlocks from task finish rewards (Jaeger via Introduction)', () => {
      expect(resolve(JAEGER)).toEqual({
        kind: 'task',
        task: { id: 'introduction', name: 'Introduction' },
      });
      expect(resolve(JAEGER, { isTaskComplete: (id) => id === 'introduction' })).toBeNull();
    });
    it('accepts the object reward shape', () => {
      const task = {
        ...introduction,
        finishRewards: { traderUnlock: { id: JAEGER.id, name: '' } },
      };
      expect(resolve(JAEGER, { tasks: [task] })).toEqual({
        kind: 'task',
        task: { id: 'introduction', name: 'Introduction' },
      });
    });
  });
  describe('storyline unlocks', () => {
    it('names the story objective gating the trader tasks', () => {
      expect(resolve(RAGMAN)).toEqual({
        kind: 'story',
        chapter: { id: 'tour', name: 'Tour' },
        objective: { id: 'talk-to-ragman', name: 'Talk to Ragman' },
      });
    });
    it('unlocks once the objective is recorded (e.g. via Mark available)', () => {
      expect(
        resolve(RAGMAN, {
          isStoryObjectiveComplete: (chapterId, objectiveId) =>
            chapterId === 'tour' && objectiveId === 'talk-to-ragman',
        })
      ).toBeNull();
    });
    it('unlocks every Tour trader once the chapter is complete', () => {
      expect(resolve(RAGMAN, { isStoryChapterComplete: (id) => id === 'tour' })).toBeNull();
    });
    it('ignores gates from chapters that do not unlock the trader', () => {
      expect(resolve(PRAPOR)).toBeNull();
    });
    it('stays unlocked when no task names the unlock objective yet', () => {
      expect(resolve(PEACEKEEPER)).toBeNull();
    });
    it.each<[string, Partial<TraderLockStatusDeps>]>([
      ['completed tasks', { isTaskComplete: (id) => id === ragmanTask.id }],
      ['loyalty level above 1', { getTraderLevel: () => 2 }],
      ['positive reputation', { getTraderReputation: () => 0.01 }],
    ])('treats existing %s as proof the trader is open', (_label, overrides) => {
      expect(resolve(RAGMAN, overrides)).toBeNull();
    });
    it('treats a completed unlock task as opening a story-gated trader', () => {
      const unlockTask = {
        id: 'ragman-unlock',
        name: 'Unlock Ragman',
        trader: { id: PRAPOR.id },
        finishRewards: { traderUnlock: [RAGMAN.id] as unknown as { id: string; name: string } },
      };
      const tasks = [...createDeps().tasks!, unlockTask];
      expect(resolve(RAGMAN, { tasks })?.kind).toBe('task');
      expect(resolve(RAGMAN, { tasks, isTaskComplete: (id) => id === unlockTask.id })).toBeNull();
    });
  });
});
