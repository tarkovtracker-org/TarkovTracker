import { describe, expect, it } from 'vitest';
import { isTaskRequirementSatisfied } from '@/features/tasks/task-requirement-helpers';
describe('isTaskRequirementSatisfied', () => {
  it('treats empty status as complete-required', () => {
    expect(isTaskRequirementSatisfied(undefined, { complete: true, failed: false })).toBe(true);
    expect(isTaskRequirementSatisfied(undefined, { complete: false, failed: true })).toBe(false);
  });
  it('accepts failed-only requirements when prereq is failed', () => {
    expect(isTaskRequirementSatisfied(['failed'], { complete: true, failed: true })).toBe(true);
    expect(isTaskRequirementSatisfied(['failed'], { complete: true, failed: false })).toBe(false);
  });
  it('accepts complete-or-failed requirements when prereq is failed', () => {
    expect(
      isTaskRequirementSatisfied(['complete', 'failed'], { complete: true, failed: true })
    ).toBe(true);
  });
  it('accepts active requirements when prereq is unlockable', () => {
    expect(isTaskRequirementSatisfied(['active'], undefined, true)).toBe(true);
  });
});
