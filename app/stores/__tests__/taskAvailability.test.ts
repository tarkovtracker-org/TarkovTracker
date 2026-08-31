import { describe, expect, it } from 'vitest';
import { buildTaskAvailability } from '@/stores/taskAvailability';
import type { Task } from '@/types/tarkov';
import type { RawTaskCompletion } from '@/utils/taskStatus';
const tasks: Task[] = [
  { id: 'prerequisite' },
  {
    id: 'dependent',
    taskRequirements: [{ task: { id: 'prerequisite' }, status: ['active'] }],
  },
];
const availabilityFor = (completion: Record<string, RawTaskCompletion>) => {
  const result = buildTaskAvailability(
    tasks,
    new Map([
      [
        'self',
        {
          completions: completion,
          faction: 'USEC',
          level: 1,
          mode: 'pvp',
          traders: {},
        },
      ],
    ]),
    null,
    false
  );
  return result.dependent?.self;
};
describe('buildTaskAvailability active requirements', () => {
  it('keeps legacy incomplete prerequisites available for active requirements', () => {
    expect(availabilityFor({ prerequisite: { complete: false, failed: false } })).toBe(true);
  });
  it('does not infer acceptance from an explicit inactive state', () => {
    expect(
      availabilityFor({ prerequisite: { active: false, complete: false, failed: false } })
    ).toBe(false);
  });
  it('accepts explicitly active and completed prerequisites', () => {
    expect(
      availabilityFor({ prerequisite: { active: true, complete: false, failed: false } })
    ).toBe(true);
    expect(availabilityFor({ prerequisite: { complete: true, failed: false } })).toBe(true);
  });
});
