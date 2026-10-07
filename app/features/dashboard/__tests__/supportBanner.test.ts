import { describe, expect, it } from 'vitest';
import { resolveSupportBanner, type SupportBannerInput } from '@/features/dashboard/supportBanner';
import type { SupporterStatus } from '@/composables/useSupporter';
const NOW = Date.parse('2026-10-07T00:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const supporterRow = (overrides: Partial<SupporterStatus>): SupporterStatus => ({
  tier: 'scav',
  status: 'active',
  type: 'subscription',
  hasEverSupported: true,
  expiresAt: null,
  startedAt: daysAgo(100),
  ...overrides,
});
const input = (overrides: Partial<SupportBannerInput> = {}): SupportBannerInput => ({
  userId: 'user-1',
  loadedUserId: 'user-1',
  supporter: null,
  createdAt: daysAgo(30),
  completedTasks: 0,
  dismissedAt: null,
  nowMs: NOW,
  ...overrides,
});
describe('resolveSupportBanner', () => {
  it('shows the first-time message to an established non-supporter', () => {
    expect(resolveSupportBanner(input())).toBe('new');
  });
  it('treats enough completed tasks as engagement on a new account', () => {
    expect(resolveSupportBanner(input({ createdAt: daysAgo(1), completedTasks: 20 }))).toBe('new');
    expect(resolveSupportBanner(input({ createdAt: daysAgo(1), completedTasks: 19 }))).toBeNull();
  });
  it('stays hidden without a parseable account age or enough progress', () => {
    expect(resolveSupportBanner(input({ createdAt: null }))).toBeNull();
    expect(resolveSupportBanner(input({ createdAt: 'not-a-date' }))).toBeNull();
  });
  it('waits until supporter status has loaded for the signed-in account', () => {
    expect(resolveSupportBanner(input({ userId: null }))).toBeNull();
    expect(resolveSupportBanner(input({ loadedUserId: null }))).toBeNull();
    expect(resolveSupportBanner(input({ loadedUserId: 'someone-else' }))).toBeNull();
  });
  it('never shows to an active or in-grace supporter', () => {
    expect(resolveSupportBanner(input({ supporter: supporterRow({}) }))).toBeNull();
    const pastDue = supporterRow({ status: 'past_due', expiresAt: daysAgo(-2) });
    expect(resolveSupportBanner(input({ supporter: pastDue }))).toBeNull();
  });
  it('asks lapsed supporters to renew instead of introducing the project', () => {
    const lapsed = supporterRow({ status: 'cancelled', expiresAt: daysAgo(10) });
    expect(resolveSupportBanner(input({ supporter: lapsed }))).toBe('returning');
  });
  it('stays dismissed for 45 days, then returns', () => {
    expect(resolveSupportBanner(input({ dismissedAt: daysAgo(44) }))).toBeNull();
    expect(resolveSupportBanner(input({ dismissedAt: daysAgo(45) }))).toBe('new');
    expect(resolveSupportBanner(input({ dismissedAt: 'garbage' }))).toBe('new');
  });
});
