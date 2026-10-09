import { describe, expect, it } from 'vitest';
import {
  isSupporterActivityActive,
  resolvePrepaidSupporter,
} from '@/features/supporter/supporterStatus';
const NOW = Date.parse('2026-05-25T12:00:00.000Z');
describe('isSupporterActivityActive', () => {
  it('treats active supporters as active without an expiry', () => {
    expect(isSupporterActivityActive({ status: 'active', expiresAt: null }, NOW)).toBe(true);
  });
  it('ends time-limited active access at its expiry', () => {
    expect(
      isSupporterActivityActive({ status: 'active', expiresAt: '2026-05-26T12:00:00.000Z' }, NOW)
    ).toBe(true);
    expect(
      isSupporterActivityActive({ status: 'active', expiresAt: '2026-05-24T12:00:00.000Z' }, NOW)
    ).toBe(false);
  });
  it('keeps past_due supporters active only during grace', () => {
    expect(
      isSupporterActivityActive({ status: 'past_due', expiresAt: '2026-05-26T12:00:00.000Z' }, NOW)
    ).toBe(true);
    expect(
      isSupporterActivityActive({ status: 'past_due', expiresAt: '2026-05-24T12:00:00.000Z' }, NOW)
    ).toBe(false);
  });
  it('does not grant active status for missing or invalid grace expiry', () => {
    expect(isSupporterActivityActive({ status: 'past_due', expiresAt: null }, NOW)).toBe(false);
    expect(isSupporterActivityActive({ status: 'past_due', expiresAt: 'not-a-date' }, NOW)).toBe(
      false
    );
  });
  it('does not grant active status to expired or cancelled supporters', () => {
    expect(
      isSupporterActivityActive({ status: 'expired', expiresAt: '2026-05-26T12:00:00.000Z' }, NOW)
    ).toBe(false);
    expect(
      isSupporterActivityActive({ status: 'cancelled', expiresAt: '2026-05-26T12:00:00.000Z' }, NOW)
    ).toBe(false);
  });
});
describe('resolvePrepaidSupporter', () => {
  const bank = {
    type: 'subscription',
    tier: 'chad',
    status: 'past_due' as const,
    expiresAt: '2026-05-25T11:59:59Z',
    oneTimeTier: 'scav',
    oneTimeRemainingSeconds: 30,
  };
  it('resumes lifetime credit with its own tier', () => {
    expect(resolvePrepaidSupporter({ ...bank, oneTimeRemainingSeconds: null }, NOW)).toMatchObject({
      type: 'one_time',
      tier: 'scav',
      status: 'active',
      expiresAt: null,
    });
  });
  it.each([undefined, -1, 0, NaN, Infinity, Number.MAX_VALUE])(
    'rejects invalid balance %s',
    (seconds) => {
      const row = { ...bank, oneTimeRemainingSeconds: seconds };
      expect(resolvePrepaidSupporter(row, NOW)).toBe(row);
    }
  );
  it.each(['expired', 'cancelled'] as const)('does not resume revoked status %s', (status) => {
    const row = { ...bank, status };
    expect(resolvePrepaidSupporter(row, NOW)).toBe(row);
  });
  it('does not resume missing or malformed grace', () => {
    for (const expiresAt of [null, 'not-a-date']) {
      const row = { ...bank, expiresAt };
      expect(resolvePrepaidSupporter(row, NOW)).toBe(row);
    }
  });
});
