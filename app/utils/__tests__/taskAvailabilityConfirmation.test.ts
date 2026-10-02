import { describe, expect, it } from 'vitest';
import {
  MAX_CONFIRMATION_TIMESTAMP,
  hasUnconfirmableStatusClock,
  isAvailabilityConfirmed,
  nextClock,
  mergeTaskAvailability,
  mergeTaskAvailabilityCandidates,
  taskAvailabilityCandidates,
  type ConfirmationMap,
  sanitizeTaskAvailabilityMap,
} from '@/utils/taskAvailabilityConfirmation';
describe('task availability confirmations', () => {
  it('matches unbounded winners in 400 deterministic ordered three-source compositions', () => {
    let seed = 1008;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    const oracleMerge = (a: ConfirmationMap, b: ConfirmationMap) => {
      const result = { ...a };
      for (const [id, value] of Object.entries(b)) {
        if (!result[id] || value.timestamp >= result[id]!.timestamp) result[id] = value;
      }
      return result;
    };
    for (let trial = 0; trial < 200; trial++) {
      const sources = Array.from({ length: 3 }, () => {
        const map: ConfirmationMap = {};
        for (let i = 0; i < 1800; i++) {
          const id = `s${String(random() % 2600).padStart(4, '0')}`;
          map[id] = { timestamp: random() % 31, requirements: 'x'.repeat(random() % 4097) };
        }
        return map;
      });
      for (const inputs of [sources, [...sources].reverse()]) {
        const oracle = inputs.reduce(oracleMerge, {});
        const candidates = inputs.reduce(mergeTaskAvailabilityCandidates, {});
        expect(candidates).toEqual(taskAvailabilityCandidates(oracle));
        expect(sanitizeTaskAvailabilityMap(candidates)).toEqual(
          sanitizeTaskAvailabilityMap(oracle)
        );
        expect(mergeTaskAvailabilityCandidates(candidates, candidates)).toEqual(candidates);
        expect(Object.keys(candidates).length).toBeLessThanOrEqual(1000);
      }
    }
  }, 30000);
  it('bounds retained candidate count and field sizes before final UTF-8 byte eviction', () => {
    const requirements = '😀'.repeat(4096);
    const source = Object.fromEntries(
      Array.from({ length: 5000 }, (_, i) => [
        `t${String(i).padStart(4, '0')}`,
        { requirements, timestamp: i },
      ])
    );
    const candidates = taskAvailabilityCandidates(source);
    expect(Object.keys(candidates)).toHaveLength(1000);
    expect(candidates).toHaveProperty('t4000');
    expect(candidates).not.toHaveProperty('t3999');
    expect(Object.keys(sanitizeTaskAvailabilityMap(candidates))).toHaveLength(15);
    expect(
      taskAvailabilityCandidates({
        tooLong: { requirements: `${requirements}x`, timestamp: 1 },
        ['x'.repeat(65)]: { requirements: '', timestamp: 1 },
        invalidClock: { requirements: '', timestamp: Infinity },
        nul: { requirements: '\u0000', timestamp: 1 },
        ['bad\u0000id']: { requirements: '', timestamp: 1 },
      })
    ).toEqual({});
  });
  it('keeps PostgreSQL C-collation tie order and handles prototype-named task IDs safely', () => {
    const source = Object.fromEntries([
      ['😀', { requirements: '', timestamp: 1 }],
      ['\uFFFD', { requirements: '', timestamp: 1 }],
      ['constructor', { requirements: 'ctor', timestamp: 1 }],
      ['__proto__', { requirements: 'proto', timestamp: 1 }],
    ]);
    expect(Object.keys(taskAvailabilityCandidates(source))).toEqual([
      '__proto__',
      'constructor',
      '\uFFFD',
      '😀',
    ]);
    expect(mergeTaskAvailability({}, source)).toEqual(source);
    expect(Object.hasOwn(mergeTaskAvailability(source, {}), '__proto__')).toBe(true);
    const inherited = Object.create({ ghost: { requirements: '', timestamp: 2 } });
    expect(taskAvailabilityCandidates(inherited)).toEqual({});
  });
  it('selects duplicate winners before byte eviction, without resurrecting older values', () => {
    const remote = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${i + 1}`,
        { requirements: 'r'.repeat(4000), timestamp: i + 1 },
      ])
    );
    const local = { s1: { requirements: 'old', timestamp: 0 } };
    const expected = sanitizeTaskAvailabilityMap(remote);
    expect(expected).not.toHaveProperty('s1');
    expect(Object.keys(expected)).toHaveLength(65);
    expect(mergeTaskAvailability(local, remote)).toEqual(expected);
    expect(mergeTaskAvailability(remote, local)).toEqual(expected);
    expect(mergeTaskAvailability(expected, remote)).toEqual(expected);
    expect(mergeTaskAvailability(remote, remote)).toEqual(expected);
  });
  it('applies remote tie precedence before byte eviction, including clear tombstones', () => {
    const oversized = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${i + 1}`,
        { requirements: 'r'.repeat(4000), timestamp: i + 1 },
      ])
    );
    const clear = { s1: { requirements: '', timestamp: 1 } };
    expect(mergeTaskAvailability(clear, oversized)).not.toHaveProperty('s1');
    const cleared = mergeTaskAvailability(oversized, clear);
    expect(cleared.s1).toEqual(clear.s1);
    expect(Object.keys(cleared)).toHaveLength(66);
    expect(mergeTaskAvailability(cleared, cleared)).toEqual(cleared);
  });
  it('bounds count after duplicate winners and orders equal clocks by task id', () => {
    const remote = Object.fromEntries(
      Array.from({ length: 1001 }, (_, i) => [
        `t${String(i).padStart(4, '0')}`,
        { requirements: 'remote', timestamp: 1 },
      ])
    );
    const local = { t1000: { requirements: 'old', timestamp: 0 } };
    const expected = sanitizeTaskAvailabilityMap(remote);
    expect(Object.keys(expected)).toHaveLength(1000);
    expect(expected).toHaveProperty('t0999');
    expect(expected).not.toHaveProperty('t1000');
    expect(mergeTaskAvailability(local, remote)).toEqual(expected);
    expect(mergeTaskAvailability(remote, local)).toEqual(expected);
    expect(mergeTaskAvailability(remote, remote)).toEqual(expected);
  });
  it('uses task id order for equal clocks at the byte boundary', () => {
    const input = Object.fromEntries(
      Array.from({ length: 66 }, (_, i) => [
        `s${String(i + 1).padStart(2, '0')}`,
        { requirements: 'r'.repeat(4000), timestamp: 1 },
      ]).reverse()
    );
    const merged = mergeTaskAvailability(input, input);
    expect(Object.keys(merged)).toHaveLength(65);
    expect(merged).toHaveProperty('s65');
    expect(merged).not.toHaveProperty('s66');
    expect(sanitizeTaskAvailabilityMap(input)).toEqual(merged);
  });
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
  it('drops over-long task ids and requirement strings', () => {
    const emoji = '\uD83D\uDE00';
    expect(
      Object.keys(
        sanitizeTaskAvailabilityMap({
          ok: { requirements: emoji.repeat(4096), timestamp: 1 },
          long: { requirements: 'r'.repeat(4097), timestamp: 1 },
          ['k'.repeat(64)]: { requirements: '', timestamp: 1 },
          ['k'.repeat(65)]: { requirements: '', timestamp: 1 },
        })
      ).sort()
    ).toEqual(['k'.repeat(64), 'ok']);
  });
  it('keeps only the newest confirmations within the entry and byte budget', () => {
    const entries = (prefix: string, count: number, start: number, requirements = 'sig') =>
      Object.fromEntries(
        Array.from({ length: count }, (_, i) => [
          `${prefix}${i}`,
          { requirements, timestamp: start + i },
        ])
      );
    const merged = mergeTaskAvailability(entries('s', 700, 0), entries('i', 700, 1000));
    expect(Object.keys(merged)).toHaveLength(1000);
    expect(merged).toHaveProperty('i0');
    expect(merged).toHaveProperty('s400');
    expect(merged).not.toHaveProperty('s399');
    const large = sanitizeTaskAvailabilityMap(entries('x', 100, 0, 'r'.repeat(4000)));
    expect(Object.keys(large)).toHaveLength(65);
    expect(large).toHaveProperty('x99');
    expect(large).not.toHaveProperty('x34');
  });
});
