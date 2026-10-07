import { isSupporterActivityActive } from '@/features/supporter/supporterStatus';
import type { SupporterStatus } from '@/composables/useSupporter';
const DAY_MS = 86_400_000;
const SUPPORT_BANNER_MIN_ACCOUNT_AGE_DAYS = 14;
const SUPPORT_BANNER_MIN_COMPLETED_TASKS = 20;
const SUPPORT_BANNER_RESHOW_DAYS = 45;
export type SupportBannerVariant = 'new' | 'returning';
export interface SupportBannerInput {
  userId: string | null;
  loadedUserId: string | null;
  supporter: SupporterStatus | null;
  createdAt: string | null;
  completedTasks: number;
  dismissedAt: string | null;
  nowMs?: number;
}
const isEngaged = (createdAt: string | null, completedTasks: number, nowMs: number): boolean => {
  if (completedTasks >= SUPPORT_BANNER_MIN_COMPLETED_TASKS) return true;
  const createdMs = createdAt ? Date.parse(createdAt) : Number.NaN;
  return (
    Number.isFinite(createdMs) && nowMs - createdMs >= SUPPORT_BANNER_MIN_ACCOUNT_AGE_DAYS * DAY_MS
  );
};
const isRecentlyDismissed = (dismissedAt: string | null, nowMs: number): boolean => {
  const dismissedMs = dismissedAt ? Date.parse(dismissedAt) : Number.NaN;
  return Number.isFinite(dismissedMs) && nowMs - dismissedMs < SUPPORT_BANNER_RESHOW_DAYS * DAY_MS;
};
const isEligibleViewer = (input: SupportBannerInput, nowMs: number): boolean => {
  if (!input.userId || input.loadedUserId !== input.userId) return false;
  if (isSupporterActivityActive(input.supporter, nowMs)) return false;
  return isEngaged(input.createdAt, input.completedTasks, nowMs);
};
export function resolveSupportBanner(input: SupportBannerInput): SupportBannerVariant | null {
  const nowMs = input.nowMs ?? Date.now();
  if (!isEligibleViewer(input, nowMs)) return null;
  if (isRecentlyDismissed(input.dismissedAt, nowMs)) return null;
  return input.supporter?.hasEverSupported ? 'returning' : 'new';
}
