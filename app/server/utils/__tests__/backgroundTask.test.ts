import { describe, expect, it, vi } from 'vitest';
import { scheduleBackgroundTask } from '@/server/utils/backgroundTask';
import type { H3Event } from 'h3';
describe('scheduleBackgroundTask', () => {
  it('registers tasks with the Cloudflare execution context', () => {
    const waitUntil = vi.fn();
    const event = {
      context: { cloudflare: { context: { waitUntil } } },
    } as unknown as H3Event;
    const task = Promise.resolve();
    scheduleBackgroundTask(event, task);
    expect(waitUntil).toHaveBeenCalledWith(task);
  });
  it('accepts tasks when no Cloudflare execution context is available', () => {
    expect(() =>
      scheduleBackgroundTask({ context: {} } as H3Event, Promise.resolve())
    ).not.toThrow();
  });
});
