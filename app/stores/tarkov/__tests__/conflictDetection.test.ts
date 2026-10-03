import { describe, expect, it } from 'vitest';
import { detectDataConflicts } from '@/stores/tarkov/conflictDetection';
import type { UserProgressData } from '@/stores/progressState';
const withTask = (completion: unknown): UserProgressData =>
  ({ taskCompletions: { task: completion } }) as unknown as UserProgressData;
const LEGACY_UNKNOWN = { complete: false, failed: false };
const EXPLICIT_INACTIVE = { active: false, complete: false, failed: false };
const EXPLICIT_ACTIVE = { active: true, complete: false, failed: false };
describe('detectDataConflicts task active state', () => {
  it.each([
    ['legacy unknown vs explicit false', LEGACY_UNKNOWN, EXPLICIT_INACTIVE],
    ['explicit false vs legacy unknown', EXPLICIT_INACTIVE, LEGACY_UNKNOWN],
    ['two legacy unknown rows', LEGACY_UNKNOWN, LEGACY_UNKNOWN],
    ['both explicit false', EXPLICIT_INACTIVE, EXPLICIT_INACTIVE],
    ['both explicit true', EXPLICIT_ACTIVE, EXPLICIT_ACTIVE],
  ])('reports no conflict for %s', (_case, local, remote) => {
    expect(detectDataConflicts(withTask(local), withTask(remote))).toEqual({
      hasConflict: false,
      conflictCount: 0,
    });
  });
  it.each([
    ['explicit true vs explicit false', EXPLICIT_ACTIVE, EXPLICIT_INACTIVE],
    ['explicit false vs explicit true', EXPLICIT_INACTIVE, EXPLICIT_ACTIVE],
    ['explicit true vs legacy unknown', EXPLICIT_ACTIVE, LEGACY_UNKNOWN],
    ['legacy unknown vs explicit true', LEGACY_UNKNOWN, EXPLICIT_ACTIVE],
  ])('reports a conflict for %s', (_case, local, remote) => {
    const result = detectDataConflicts(withTask(local), withTask(remote));
    expect(result.conflictCount).toBe(1);
    expect(result.hasConflict).toBe(true);
  });
  it('still reports terminal-flag disagreement', () => {
    const result = detectDataConflicts(
      withTask(EXPLICIT_ACTIVE),
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
