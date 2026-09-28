import { describe, expect, it } from 'vitest';
import {
  isAvailabilityConfirmed,
  mergeTaskAvailability,
  sanitizeTaskAvailabilityMap,
} from '@/utils/taskAvailabilityConfirmation';
describe('task availability confirmations', () => {
  it('honours only the exact signature and not an older confirmation than the status', () => {
    const confirmation = { requirements: 'sig', timestamp: 100 };
    expect(isAvailabilityConfirmed(confirmation, undefined, 'sig')).toBe(true);
    expect(isAvailabilityConfirmed(confirmation, { complete: false, timestamp: 100 }, 'sig')).toBe(
      true
    );
    expect(isAvailabilityConfirmed(confirmation, { complete: false, timestamp: 101 }, 'sig')).toBe(
      false
    );
    expect(isAvailabilityConfirmed(confirmation, undefined, 'other')).toBe(false);
    expect(isAvailabilityConfirmed(confirmation, undefined, undefined)).toBe(false);
    expect(isAvailabilityConfirmed({ requirements: '', timestamp: 100 }, undefined, '')).toBe(
      false
    );
    expect(isAvailabilityConfirmed(undefined, undefined, 'sig')).toBe(false);
  });
  it('treats a legacy boolean completion as having no status clock', () => {
    expect(isAvailabilityConfirmed({ requirements: 'sig', timestamp: 0 }, false, 'sig')).toBe(true);
  });
  it('merges per task by the newest timestamp, remote winning ties', () => {
    expect(
      mergeTaskAvailability(
        { a: { requirements: 'local', timestamp: 5 }, b: { requirements: 'b', timestamp: 9 } },
        { a: { requirements: 'remote', timestamp: 5 }, c: { requirements: '', timestamp: 1 } }
      )
    ).toEqual({
      a: { requirements: 'remote', timestamp: 5 },
      b: { requirements: 'b', timestamp: 9 },
      c: { requirements: '', timestamp: 1 },
    });
  });
  it('ignores malformed inputs when merging', () => {
    expect(mergeTaskAvailability(undefined, { a: 'x' } as never)).toEqual({});
    expect(sanitizeTaskAvailabilityMap({ '': { requirements: 'x', timestamp: 1 } })).toEqual({});
    expect(
      sanitizeTaskAvailabilityMap({ a: { requirements: 'x', timestamp: Number.NaN } })
    ).toEqual({});
    expect(
      sanitizeTaskAvailabilityMap({
        a: { requirements: 'x', timestamp: Number.MAX_SAFE_INTEGER + 2 },
      })
    ).toEqual({});
    expect(
      sanitizeTaskAvailabilityMap({ a: { requirements: 'x', timestamp: Number.MAX_SAFE_INTEGER } })
    ).toEqual({ a: { requirements: 'x', timestamp: Number.MAX_SAFE_INTEGER } });
  });
});
