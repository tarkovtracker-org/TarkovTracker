import type { SupporterStatus } from '@/composables/useSupporter';
export type ProfileSupporterBadge = 'supporter' | 'active_subscriber';
export const isProfileSupporterBadge = (value: unknown): value is ProfileSupporterBadge =>
  value === 'supporter' || value === 'active_subscriber';
export const normalizeProfileSupporterBadge = (value: unknown): ProfileSupporterBadge | null =>
  isProfileSupporterBadge(value) ? value : null;
export const getOwnProfileSupporterBadge = (
  supporter: SupporterStatus | null,
  hasActiveSubscriptionAccess: boolean
): ProfileSupporterBadge | null => {
  // The retention trigger clears has_ever_supported when a supporter is disqualified.
  if (!supporter?.hasEverSupported) return null;
  const subscribed =
    hasActiveSubscriptionAccess &&
    supporter.status === 'active' &&
    Boolean(supporter.stripeSubscriptionId);
  return subscribed ? 'active_subscriber' : 'supporter';
};
