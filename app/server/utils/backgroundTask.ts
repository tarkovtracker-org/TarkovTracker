import type { H3Event } from 'h3';
type CloudflareExecutionContext = {
  waitUntil?: (task: Promise<unknown>) => void;
};
type CloudflareEventContext = {
  cloudflare?: { context?: CloudflareExecutionContext };
};
export function scheduleBackgroundTask(event: H3Event, task: Promise<unknown>): void {
  const context = (event.context as CloudflareEventContext).cloudflare?.context;
  if (context?.waitUntil) {
    context.waitUntil(task);
    return;
  }
  void task;
}
