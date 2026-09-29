import { describe, expect, it } from 'vitest';
import {
  MAX_CONFIRMATION_TIMESTAMP,
  hasUnconfirmableStatusClock,
  isAvailabilityConfirmed,
  nextClock,
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
        a: { requirements: 'x', timestamp: MAX_CONFIRMATION_TIMESTAMP + 1 },
      })
    ).toEqual({});
    expect(
      sanitizeTaskAvailabilityMap({
        a: { requirements: 'x', timestamp: MAX_CONFIRMATION_TIMESTAMP },
      })
    ).toEqual({ a: { requirements: 'x', timestamp: MAX_CONFIRMATION_TIMESTAMP } });
  });
  it('clamps successor clocks so every written value stays persistable', () => {
    // Review #979: a clear after a confirmation at the ceiling must still be storable.
    expect(nextClock(MAX_CONFIRMATION_TIMESTAMP)).toBe(MAX_CONFIRMATION_TIMESTAMP);
    expect(
      sanitizeTaskAvailabilityMap({
        a: { requirements: '', timestamp: nextClock(MAX_CONFIRMATION_TIMESTAMP) },
      })
    ).toEqual({ a: { requirements: '', timestamp: MAX_CONFIRMATION_TIMESTAMP } });
    expect(nextClock(5)).toBeGreaterThanOrEqual(Date.now() - 1_000);
  });
  it('lets an out-of-range status clock retire a valid confirmation', () => {
    const confirmation = { requirements: 'sig', timestamp: 100 };
    const reset = { complete: false, timestamp: MAX_CONFIRMATION_TIMESTAMP * 10 };
    expect(isAvailabilityConfirmed(confirmation, reset, 'sig')).toBe(false);
  });
  it('drops task ids PostgreSQL jsonb would reject as object keys', () => {
    expect(
      sanitizeTaskAvailabilityMap({ 'a\uD800': { requirements: 'sig', timestamp: 1 } })
    ).toEqual({});
  });
  it('flags a status clock no confirmation can follow', () => {
    expect(hasUnconfirmableStatusClock({ timestamp: MAX_CONFIRMATION_TIMESTAMP })).toBe(true);
    expect(hasUnconfirmableStatusClock({ timestamp: Date.now() })).toBe(false);
    expect(hasUnconfirmableStatusClock(undefined)).toBe(false);
  });
  it('drops requirement strings PostgreSQL jsonb would reject', () => {
    expect(
      sanitizeTaskAvailabilityMap({
        lone: { requirements: 'a\uD800b', timestamp: 1 },
        trail: { requirements: 'a\uDC00', timestamp: 1 },
        pair: { requirements: 'a\uD83D\uDE00', timestamp: 1 },
      })
    ).toEqual({ pair: { requirements: 'a\uD83D\uDE00', timestamp: 1 } });
  });
  it('never honours a saturated confirmation clock', () => {
    expect(
      isAvailabilityConfirmed(
        { requirements: 'sig', timestamp: MAX_CONFIRMATION_TIMESTAMP },
        undefined,
        'sig'
      )
    ).toBe(false);
  });
});
