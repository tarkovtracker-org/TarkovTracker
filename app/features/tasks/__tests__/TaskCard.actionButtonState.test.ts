import { describe, expect, it } from 'vitest';
import { resolveTaskActionButtonState } from '@/features/tasks/types';
const computeActionButtonState = (
  options: Omit<Parameters<typeof resolveTaskActionButtonState>[0], 'isActive'> & {
    isActive?: boolean;
  }
) => resolveTaskActionButtonState({ isActive: false, ...options });
describe('TaskCard action button state', () => {
  it('uses complete-state actions when task is failed', () => {
    const state = computeActionButtonState({
      isOurFaction: true,
      isFailed: true,
      isLocked: false,
      isComplete: false,
      showHotWheelsFail: false,
    });
    expect(state).toBe('complete');
  });
  it('failed state takes precedence over hotwheels and locked states', () => {
    const state = computeActionButtonState({
      isOurFaction: true,
      isFailed: true,
      isLocked: true,
      isComplete: false,
      showHotWheelsFail: true,
    });
    expect(state).toBe('complete');
  });
  it('returns none when task does not match current faction', () => {
    const state = computeActionButtonState({
      isOurFaction: false,
      isFailed: true,
      isLocked: true,
      isComplete: true,
      showHotWheelsFail: true,
    });
    expect(state).toBe('none');
  });
  it('keeps available state for normal unlocked non-failed tasks', () => {
    const state = computeActionButtonState({
      isOurFaction: true,
      isFailed: false,
      isLocked: false,
      isComplete: false,
      showHotWheelsFail: false,
    });
    expect(state).toBe('available');
  });
  it('distinguishes active tasks from available tasks', () => {
    const state = computeActionButtonState({
      isOurFaction: true,
      isFailed: false,
      isLocked: false,
      isComplete: false,
      isActive: true,
      showHotWheelsFail: false,
    });
    expect(state).toBe('active');
  });
});
