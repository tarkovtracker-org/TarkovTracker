import { describe, expect, it } from 'vitest';
import { isTraderLocked } from '@/features/dashboard/traderLockStatus';
import { GAME_MODES, TASK_ID_REGISTRY } from '@/utils/constants';
import type { TraderLockStatusDeps } from '@/features/dashboard/traderLockStatus';
const createDeps = (overrides: Partial<TraderLockStatusDeps> = {}): TraderLockStatusDeps => ({
  tasks: [{ id: TASK_ID_REGISTRY.GETTING_ACQUAINTED }, { id: TASK_ID_REGISTRY.EASY_MONEY_PART_1 }],
  isTaskComplete: () => false,
  gameMode: GAME_MODES.PVP,
  ...overrides,
});
describe('isTraderLocked', () => {
  it('returns false for traders with no unlock task config', () => {
    expect(isTraderLocked({ normalizedName: 'prapor' }, createDeps())).toBe(false);
  });
  it('returns true when the unlock task is not complete', () => {
    expect(isTraderLocked({ normalizedName: 'lightkeeper' }, createDeps())).toBe(true);
  });
  it('returns false when the unlock task is complete', () => {
    expect(
      isTraderLocked(
        { normalizedName: 'lightkeeper' },
        createDeps({
          isTaskComplete: (id) => id === TASK_ID_REGISTRY.GETTING_ACQUAINTED,
        })
      )
    ).toBe(false);
  });
  it('assumes locked when metadata tasks have not loaded yet', () => {
    expect(isTraderLocked({ normalizedName: 'lightkeeper' }, createDeps({ tasks: [] }))).toBe(true);
    expect(isTraderLocked({ normalizedName: 'lightkeeper' }, createDeps({ tasks: null }))).toBe(
      true
    );
    expect(
      isTraderLocked({ normalizedName: 'lightkeeper' }, createDeps({ tasks: undefined }))
    ).toBe(true);
  });
  it('does not assume locked for traders without unlock tasks when metadata is empty', () => {
    expect(isTraderLocked({ normalizedName: 'prapor' }, createDeps({ tasks: [] }))).toBe(false);
  });
  it('resolves ref unlock task by game mode', () => {
    expect(
      isTraderLocked(
        { normalizedName: 'ref' },
        createDeps({
          tasks: [{ id: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP }],
          isTaskComplete: () => false,
          gameMode: GAME_MODES.PVP,
        })
      )
    ).toBe(true);
    expect(
      isTraderLocked(
        { normalizedName: 'ref' },
        createDeps({
          tasks: [{ id: TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP }],
          isTaskComplete: (id) => id === TASK_ID_REGISTRY.EASY_MONEY_PART_1_PVP,
          gameMode: GAME_MODES.PVP,
        })
      )
    ).toBe(false);
  });
});
