import { describe, expect, it } from 'vitest';
import { oneTimeExpiresAt, oneTimePeriods } from './stripeOneTime.ts';
const now = new Date('2026-10-07T00:00:00.000Z');
const days = (count: number, from = now) =>
  new Date(from.getTime() + count * 86_400_000).toISOString();
const paidAt = now.toISOString();
describe('one-time supporter duration', () => {
  it('grants one 30-day period per full $4, capped at twelve', () => {
    expect(oneTimePeriods(0)).toBe(0);
    expect(oneTimePeriods(399)).toBe(0);
    expect(oneTimePeriods(443)).toBe(1);
    expect(oneTimePeriods(1000)).toBe(2);
    expect(oneTimePeriods(50_000)).toBe(12);
  });
  it('starts the period from the payment date', () => {
    const later = new Date(days(5));
    expect(oneTimeExpiresAt(null, 400, days(2), later)).toBe(days(32));
  });
  it('starts a new or lapsed supporter at payment', () => {
    expect(oneTimeExpiresAt(null, 800, paidAt, now)).toBe(days(60));
    const lapsed = { type: 'subscription', status: 'expired', expires_at: days(-5) };
    expect(oneTimeExpiresAt(lapsed, 400, paidAt, now)).toBe(days(30));
  });
  it('stacks onto remaining one-time access', () => {
    const active = {
      type: 'one_time',
      status: 'active',
      expires_at: days(20),
      last_contribution_at: days(-10),
    };
    expect(oneTimeExpiresAt(active, 400, paidAt, now)).toBe(days(50));
  });
  it('does not stack a replayed payment twice', () => {
    const applied = {
      type: 'one_time',
      status: 'active',
      expires_at: days(30),
      last_contribution_at: paidAt,
    };
    expect(oneTimeExpiresAt(applied, 300, paidAt, now)).toBe(days(30));
  });
  it('keeps grandfathered open-ended one-time access', () => {
    const legacy = { type: 'one_time', status: 'active', expires_at: null };
    expect(oneTimeExpiresAt(legacy, 300, paidAt, now)).toBeNull();
  });
  it('keeps open-ended access for payments made before the change', () => {
    expect(oneTimeExpiresAt(null, 300, days(-1), now)).toBeNull();
  });
  it('stacks a distinct older payment delivered out of order', () => {
    const newer = {
      type: 'one_time',
      status: 'active',
      expires_at: days(30),
      last_contribution_at: days(1),
    };
    expect(oneTimeExpiresAt(newer, 400, paidAt, now)).toBe(days(60));
  });
  it('does not extend from an expired or revoked one-time row', () => {
    const expired = { type: 'one_time', status: 'expired', expires_at: days(10) };
    expect(oneTimeExpiresAt(expired, 400, paidAt, now)).toBe(days(30));
  });
});
