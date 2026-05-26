import { describe, expect, it } from 'vitest';
import { isSupporterActivityActive } from '@/features/supporter/supporterStatus';
const NOW = Date.parse('2026-05-25T12:00:00.000Z');
describe('isSupporterActivityActive', () => {
  it('treats active supporters as active without an expiry', () => {
    expect(isSupporterActivityActive({ status: 'active', expiresAt: null }, NOW)).toBe(true);
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
