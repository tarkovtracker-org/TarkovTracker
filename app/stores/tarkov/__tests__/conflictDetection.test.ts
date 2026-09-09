import { describe, expect, it } from 'vitest';
import { detectDataConflicts } from '@/stores/tarkov/conflictDetection';
import type { UserProgressData } from '@/stores/progressState';
const withTask = (completion: unknown): UserProgressData =>
  ({ taskCompletions: { task: completion } }) as unknown as UserProgressData;
describe('detectDataConflicts task active state', () => {
  it.each([
    ['legacy unknown vs explicit false', undefined, { complete: false, failed: false }],
    [
      'explicit false vs legacy unknown',
      { active: false, complete: false, failed: false },
      { complete: false, failed: false },
    ],
    [
      'both explicit false',
      { active: false, complete: false, failed: false },
      { active: false, complete: false, failed: false },
    ],
    [
      'both explicit true',
      { active: true, complete: false, failed: false },
      { active: true, complete: false, failed: false },
    ],
  ])('reports no conflict for %s', (_case, local, remote) => {
    const result = detectDataConflicts(
      withTask(local ?? { complete: false, failed: false }),
      withTask(remote)
    );
    expect(result).toEqual({ hasConflict: false, conflictCount: 0 });
  });
  it('reports a conflict when only one side is authoritatively active', () => {
    const result = detectDataConflicts(
      withTask({ active: true, complete: false, failed: false }),
      withTask({ active: false, complete: false, failed: false })
    );
    expect(result.conflictCount).toBe(1);
    expect(result.hasConflict).toBe(true);
  });
  it('still reports terminal-flag disagreement', () => {
    const result = detectDataConflicts(
      withTask({ active: true, complete: false, failed: false }),
      withTask({ complete: true, failed: false })
    );
    expect(result.conflictCount).toBe(1);
  });
  it('tolerates legacy boolean completions on either side', () => {
    expect(detectDataConflicts(withTask(true), withTask(true)).conflictCount).toBe(0);
    expect(
      detectDataConflicts(withTask(true), withTask({ complete: true, failed: false })).conflictCount
    ).toBe(0);
  });
});
