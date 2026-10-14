export const MAX_CLIENT_LOG_BYTES = 128 * 1024;
const MAX_CLIENT_LOG_DEPTH = 8;
export async function readClientLogBytes(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CLIENT_LOG_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return concatenateChunks(chunks, size);
  } finally {
    reader.releaseLock();
  }
}
function concatenateChunks(chunks: Uint8Array[], size: number): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
const isContainer = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
type PendingContainer = { value: object; depth: number };
function enqueueContainers(value: object, depth: number, pending: PendingContainer[]): void {
  for (const child of Object.values(value)) {
    if (isContainer(child)) pending.push({ value: child, depth: depth + 1 });
  }
}
export function hasSafeClientLogDepth(args: unknown[]): boolean {
  const pending: PendingContainer[] = [{ value: args, depth: 0 }];
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (depth > MAX_CLIENT_LOG_DEPTH) return false;
    enqueueContainers(value, depth, pending);
  }
  return true;
}
function isClientLogRequest(request: Request): boolean {
  if (request.method !== 'POST') return false;
  const path = decodeLogPath(new URL(request.url).pathname).replace(/\/+$/, '');
  return path === '/api/logs/client';
}
export async function boundedClientLogRequest(request: Request): Promise<Request | Response> {
  if (!isClientLogRequest(request) || !request.body) return request;
  const bytes = await readClientLogBytes(request.body).catch(() => null);
  if (!bytes) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  return new Request(request, { body: bytes });
}
function decodeLogPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
