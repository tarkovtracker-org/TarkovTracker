import { describe, expect, it } from 'vitest';
import { getOwnProfileSupporterBadge } from '@/utils/profileSupporterBadge';
import type { SupporterStatus } from '@/composables/useSupporter';
const active: SupporterStatus = {
  tier: 'scav',
  status: 'active',
  type: 'subscription',
  hasEverSupported: true,
  startedAt: '2026-11-01T00:00:00Z',
  expiresAt: null,
  stripeSubscriptionId: 'sub_fixture',
};
describe('own profile supporter badge', () => {
  it('does not show a badge without recorded support', () => {
    expect(getOwnProfileSupporterBadge(null, false)).toBeNull();
    expect(getOwnProfileSupporterBadge({ ...active, hasEverSupported: false }, true)).toBeNull();
  });
  it('shows Active Subscriber for a genuine active subscription', () => {
    expect(getOwnProfileSupporterBadge(active, true)).toBe('active_subscriber');
  });
  it('recognizes previous support, one-time support, past-due billing, and complimentary access', () => {
    expect(getOwnProfileSupporterBadge(active, false)).toBe('supporter');
    expect(getOwnProfileSupporterBadge({ ...active, type: 'one_time' }, false)).toBe('supporter');
    expect(getOwnProfileSupporterBadge({ ...active, status: 'past_due' }, true)).toBe('supporter');
    expect(getOwnProfileSupporterBadge({ ...active, stripeSubscriptionId: null }, true)).toBe(
      'supporter'
    );
  });
});
