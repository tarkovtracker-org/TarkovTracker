import { describe, expect, it } from 'vitest';
import {
  getAllUsersTraderRank,
  getUserTraderRank,
  isLockedForAllUsers,
  matchesAllUsersView,
  type TeamTaskStatus,
  type UserTraderRankState,
} from '@/utils/allUsersTaskStatus';
const status = (teamId: string, overrides: Partial<TeamTaskStatus> = {}): TeamTaskStatus => ({
  teamId,
  isUnlocked: false,
  isActive: false,
  isCompleted: false,
  isFailed: false,
  ...overrides,
});
const AVAILABLE = status('a', { isUnlocked: true });
const ACTIVE = status('b', { isActive: true, isUnlocked: true });
const COMPLETED = status('c', { isCompleted: true, isUnlocked: true });
const FAILED = status('d', { isFailed: true, isUnlocked: true });
const LOCKED = status('e');
describe('matchesAllUsersView', () => {
  it('treats the views as independent membership tests', () => {
    const statuses = [AVAILABLE, ACTIVE];
    expect(matchesAllUsersView('available', statuses, false)).toBe(true);
    expect(matchesAllUsersView('active', statuses, false)).toBe(true);
    expect(matchesAllUsersView('completed', statuses, false)).toBe(false);
    expect(matchesAllUsersView('failed', statuses, false)).toBe(false);
    expect(matchesAllUsersView('locked', statuses, false)).toBe(false);
  });
  it('keeps a task active for one teammate and failed for another in both views', () => {
    const statuses = [ACTIVE, FAILED];
    expect(matchesAllUsersView('active', statuses, false)).toBe(true);
    expect(matchesAllUsersView('failed', statuses, false)).toBe(true);
  });
  it('requires every teammate to have completed without failing', () => {
    expect(matchesAllUsersView('completed', [COMPLETED, COMPLETED], false)).toBe(true);
    expect(matchesAllUsersView('completed', [COMPLETED, ACTIVE], false)).toBe(false);
    expect(
      matchesAllUsersView(
        'completed',
        [COMPLETED, status('f', { isCompleted: true, isFailed: true })],
        false
      )
    ).toBe(false);
  });
  it('gates only available and locked on invalid tasks', () => {
    expect(matchesAllUsersView('available', [AVAILABLE], true)).toBe(false);
    expect(matchesAllUsersView('locked', [LOCKED], true)).toBe(false);
    expect(matchesAllUsersView('active', [ACTIVE], true)).toBe(true);
    expect(matchesAllUsersView('failed', [FAILED], true)).toBe(true);
    expect(matchesAllUsersView('completed', [COMPLETED], true)).toBe(true);
  });
  it('reports locked only when no other status applies', () => {
    expect(isLockedForAllUsers([LOCKED])).toBe(true);
    expect(isLockedForAllUsers([LOCKED, AVAILABLE])).toBe(false);
    expect(isLockedForAllUsers([LOCKED, ACTIVE])).toBe(false);
  });
});
describe('getAllUsersTraderRank', () => {
  it('ranks active ahead of merely being available to another teammate', () => {
    expect(getAllUsersTraderRank([AVAILABLE, ACTIVE], false)).toBe(1);
    expect(getAllUsersTraderRank([ACTIVE], false)).toBe(1);
  });
  it('keeps available first when nobody has started the task', () => {
    expect(getAllUsersTraderRank([AVAILABLE, LOCKED], false)).toBe(0);
  });
  it('ranks locked-only tasks with the in-progress group', () => {
    expect(getAllUsersTraderRank([LOCKED], false)).toBe(1);
  });
  it('ranks an invalid available task with the in-progress group', () => {
    expect(getAllUsersTraderRank([AVAILABLE], true)).toBe(1);
  });
  it('keeps completed and failed after the earlier groups', () => {
    expect(getAllUsersTraderRank([COMPLETED, COMPLETED], false)).toBe(2);
    expect(getAllUsersTraderRank([FAILED, LOCKED], false)).toBe(3);
  });
  it('still surfaces a task someone can pick up over a terminal state elsewhere', () => {
    expect(getAllUsersTraderRank([AVAILABLE, FAILED], false)).toBe(0);
  });
});
describe('getUserTraderRank', () => {
  const state = (overrides: Partial<UserTraderRankState> = {}): UserTraderRankState => ({
    isUnlocked: false,
    isActive: false,
    isCompleted: false,
    isFailed: false,
    isInvalid: false,
    ...overrides,
  });
  it.each([
    ['available', state({ isUnlocked: true }), 0],
    ['active', state({ isUnlocked: true, isActive: true }), 1],
    ['locked', state(), 1],
    ['completed', state({ isUnlocked: true, isCompleted: true }), 2],
    ['failed', state({ isUnlocked: true, isFailed: true }), 3],
    [
      'completed and failed together counts as failed',
      state({ isCompleted: true, isFailed: true }),
      3,
    ],
    ['unlocked but invalid falls through', state({ isUnlocked: true, isInvalid: true }), 1],
  ])('ranks %s', (_case, value, expected) => {
    expect(getUserTraderRank(value)).toBe(expected);
  });
});
