import { authorizedLifecycleWorker } from './lifecycle-worker-auth.ts';
import { DeliveryUnavailable, deliveryUnavailableResponse } from './lifecycle-delivery.ts';
type WorkerKind = 'stripe_cleanup' | 'discord_cleanup' | 'stripe_event' | 'checkout_reconciliation';
export function lifecycleWorkerHandler(
  secret: string | undefined,
  process: (kind: WorkerKind) => Promise<unknown>
) {
  return async (req: Request): Promise<Response> => {
    if (!(await authorizedLifecycleWorker(req, secret)))
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (req.method !== 'POST')
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    const kind = await workerKind(req);
    if (!kind) return Response.json({ error: 'Invalid worker kind' }, { status: 400 });
    return execute(req, kind, process);
  };
}
async function workerKind(req: Request): Promise<WorkerKind | null> {
  // No body, resource IDs, batch count or arbitrary RPC arguments are accepted.
  const kind = new URL(req.url).searchParams.get('kind');
  if (!(await emptyBody(req))) return null;
  const kinds = new Map<string, WorkerKind>([
    ['stripe_cleanup', 'stripe_cleanup'],
    ['discord_cleanup', 'discord_cleanup'],
    ['stripe_event', 'stripe_event'],
    ['checkout_reconciliation', 'checkout_reconciliation'],
  ]);
  return kinds.get(kind ?? '') ?? null;
}
async function execute(
  req: Request,
  kind: WorkerKind,
  process: (kind: WorkerKind) => Promise<unknown>
): Promise<Response> {
  const start = performance.now();
  try {
    const result = await process(kind);
    console.info(
      JSON.stringify({
        event: 'lifecycle_worker_finished',
        kind,
        elapsed_ms: Math.round(performance.now() - start),
        result,
      })
    );
    return Response.json({ success: true, result });
  } catch (error) {
    if (error instanceof DeliveryUnavailable) return deliveryUnavailableResponse(req);
    console.error(
      JSON.stringify({
        event: 'lifecycle_worker_failed',
        kind,
        elapsed_ms: Math.round(performance.now() - start),
      })
    );
    return Response.json({ error: 'Worker failed' }, { status: 503 });
  }
}
async function emptyBody(req: Request): Promise<boolean> {
  if (!req.body) return true;
  const reader = req.body.getReader();
  try {
    return await emptyReader(reader);
  } finally {
    await reader.cancel();
  }
}
async function emptyReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<boolean> {
  for (let frame = 0; frame < 4; frame++) {
    const result = await reader.read();
    if (result.done) return true;
    if (result.value.byteLength !== 0) return false;
  }
  return false;
}
