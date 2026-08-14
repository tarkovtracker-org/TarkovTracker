import { createLogger } from '@/server/utils/logger';
import type { H3Event } from 'h3';
const logger = createLogger('BackgroundTask');
type CloudflareExecutionContext = {
  waitUntil?: (task: Promise<unknown>) => void;
};
type CloudflareEventContext = {
  cloudflare?: { context?: CloudflareExecutionContext };
};
export function scheduleBackgroundTask(event: H3Event, task: Promise<unknown>): void {
  const guardedTask = task.catch((error) => {
    logger.warn('Background task failed', error);
  });
  const context = (event.context as CloudflareEventContext).cloudflare?.context;
  if (context?.waitUntil) {
    context.waitUntil(guardedTask);
    return;
  }
  void guardedTask;
}
