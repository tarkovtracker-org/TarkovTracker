// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useSupporterActivity } from '@/composables/useSupporterActivity';
import type { SupporterActivity } from '@/features/supporter/supporterStatus';
describe('useSupporterActivity', () => {
  it('updates at expiry and immediately on a focus after sleep', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
    const scope = effectScope();
    const supporter = ref<SupporterActivity | null>({
      status: 'active',
      expiresAt: '2026-10-07T00:00:01Z',
    });
    try {
      const active = scope.run(() => useSupporterActivity(supporter))!;
      expect(active.value).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(active.value).toBe(false);
      supporter.value = { status: 'active', expiresAt: '2026-10-07T00:00:03Z' };
      expect(active.value).toBe(true);
      vi.setSystemTime(new Date('2026-10-07T00:00:05Z'));
      window.dispatchEvent(new Event('focus'));
      await nextTick();
      expect(active.value).toBe(false);
    } finally {
      scope.stop();
      vi.useRealTimers();
    }
  });
});
