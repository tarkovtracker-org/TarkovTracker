import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleBackgroundTask } from '@/server/utils/backgroundTask';
import type { H3Event } from 'h3';
const mockWarn = vi.hoisted(() => vi.fn());
vi.mock('@/server/utils/logger', () => ({
  createLogger: () => ({ warn: mockWarn }),
}));
describe('scheduleBackgroundTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('registers a guarded task with the Cloudflare execution context', async () => {
    const waitUntil = vi.fn();
    const event = {
      context: { cloudflare: { context: { waitUntil } } },
    } as unknown as H3Event;
    scheduleBackgroundTask(event, Promise.reject(new Error('refresh failed')));
    const guardedTask = waitUntil.mock.calls[0]?.[0] as Promise<unknown>;
    await expect(guardedTask).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith('Background task failed', expect.any(Error));
  });
  it('contains rejected tasks without a Cloudflare execution context', async () => {
    scheduleBackgroundTask({ context: {} } as H3Event, Promise.reject(new Error('refresh failed')));
    await vi.waitFor(() => {
      expect(mockWarn).toHaveBeenCalledWith('Background task failed', expect.any(Error));
    });
  });
});
