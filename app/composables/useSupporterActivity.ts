import { useEventListener, useNow } from '@vueuse/core';
import {
  isSupporterActivityActive,
  resolvePrepaidSupporter,
  type BankedSupporterActivity,
  type SupporterActivity,
} from '@/features/supporter/supporterStatus';
/** Expiry changes without a database update; refresh time while open and on resume. */
const useSupporterClock = () => {
  const now = useNow({ interval: 1000 });
  const refresh = () => {
    now.value = new Date();
  };
  useEventListener('focus', refresh);
  useEventListener('pageshow', refresh);
  useEventListener(
    typeof document === 'undefined' ? undefined : document,
    'visibilitychange',
    refresh
  );
  return now;
};
export function useSupporterEntitlement<T extends BankedSupporterActivity>(
  supporter: Ref<T | null>
) {
  const now = useSupporterClock();
  return computed(() => resolvePrepaidSupporter(supporter.value, now.value.getTime()));
}
export function useSupporterActivity(supporter: Ref<SupporterActivity | null>) {
  const now = useSupporterClock();
  return computed(() =>
    isSupporterActivityActive(
      resolvePrepaidSupporter(supporter.value, now.value.getTime()),
      now.value.getTime()
    )
  );
}
