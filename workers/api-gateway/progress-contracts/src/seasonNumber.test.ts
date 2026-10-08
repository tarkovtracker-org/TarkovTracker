import { describe, expect, it } from 'vitest';
import { isSeasonNumber } from './seasonNumber';
describe('isSeasonNumber', () => {
  it.each([1, 2, 32767])('accepts the positive integer %j', (value) => {
    expect(isSeasonNumber(value)).toBe(true);
  });
  it.each([
    undefined,
    null,
    true,
    false,
    '2',
    [2],
    {},
    0,
    -0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects %s', (value) => {
    expect(isSeasonNumber(value)).toBe(false);
  });
});
