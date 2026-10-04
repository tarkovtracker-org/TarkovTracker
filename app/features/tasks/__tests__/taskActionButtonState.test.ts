import { describe, expect, it } from 'vitest';
import { resolveTaskActionButtonState } from '@/features/tasks/types';
const baseOptions = {
  isOurFaction: true,
  isFailed: false,
  isLocked: false,
  canMarkAvailable: () => true,
  isComplete: false,
  isActive: true,
  showHotWheelsFail: false,
};
describe('resolveTaskActionButtonState', () => {
  it('uses the active state unless the active task has the Hot Wheels failure action', () => {
    expect(resolveTaskActionButtonState(baseOptions)).toBe('active');
    expect(resolveTaskActionButtonState({ ...baseOptions, showHotWheelsFail: true })).toBe(
      'hotwheels'
    );
  });
  it('keeps an explicitly inactive task available', () => {
    expect(resolveTaskActionButtonState({ ...baseOptions, isActive: false })).toBe('available');
  });
});
