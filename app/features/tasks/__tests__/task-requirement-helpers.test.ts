import { describe, expect, it } from 'vitest';
import {
  getCurrentTaskStatusForRequirement,
  getRequiredTaskStatuses,
  isTaskRequirementSatisfied,
} from '@/features/tasks/task-requirement-helpers';
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
  it('accepts active requirements only for explicit active or completed tasks', () => {
    expect(
      isTaskRequirementSatisfied(['active'], {
        active: true,
        complete: false,
        failed: false,
      })
    ).toBe(true);
    expect(isTaskRequirementSatisfied(['active'], { complete: true, failed: false })).toBe(true);
    expect(isTaskRequirementSatisfied(['active'], { complete: false, failed: false })).toBe(false);
    expect(isTaskRequirementSatisfied(['active'], undefined)).toBe(false);
  });
});
describe('getRequiredTaskStatuses', () => {
  it('returns completed when no statuses are provided', () => {
    expect(getRequiredTaskStatuses(undefined)).toEqual(['completed']);
    expect(getRequiredTaskStatuses([])).toEqual(['completed']);
  });
  it('normalizes supported status aliases', () => {
    expect(getRequiredTaskStatuses(['Complete', 'Accept', 'FAILED'])).toEqual([
      'completed',
      'active',
      'failed',
    ]);
  });
});
describe('getCurrentTaskStatusForRequirement', () => {
  it('returns failed before completed when both flags are present', () => {
    expect(getCurrentTaskStatusForRequirement({ complete: true, failed: true })).toBe('failed');
  });
  it('returns available for unlockable tasks without completion data', () => {
    expect(getCurrentTaskStatusForRequirement(undefined, true)).toBe('available');
  });
  it('returns not_started when there is no active, completed, or failed state', () => {
    expect(getCurrentTaskStatusForRequirement(undefined)).toBe('not_started');
  });
});
