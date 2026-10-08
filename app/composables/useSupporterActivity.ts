import { useEventListener, useNow } from '@vueuse/core';
import {
  isSupporterActivityActive,
  type SupporterActivity,
} from '@/features/supporter/supporterStatus';
/** Expiry changes without a database update; refresh time while open and on resume. */
export function useSupporterActivity(supporter: Ref<SupporterActivity | null>) {
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
  return computed(() => isSupporterActivityActive(supporter.value, now.value.getTime()));
}
