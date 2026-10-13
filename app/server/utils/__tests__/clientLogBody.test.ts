// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  boundedClientLogRequest,
  hasSafeClientLogDepth,
  MAX_CLIENT_LOG_BYTES,
  readClientLogBytes,
} from '@/server/utils/clientLogBody';
describe('client log body boundary', () => {
  it('counts actual stream bytes and cancels before consuming later chunks', async () => {
    const cancel = vi.fn();
    let reads = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(MAX_CLIENT_LOG_BYTES));
        },
        cancel,
      },
      { highWaterMark: 0 }
    );
    expect(await readClientLogBytes(stream)).toBeNull();
    expect(reads).toBe(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('preserves an exactly bounded body and measures UTF-8 bytes', async () => {
    const exact = new Blob([new Uint8Array(MAX_CLIENT_LOG_BYTES)]);
    expect((await readClientLogBytes(exact.stream()))?.byteLength).toBe(MAX_CLIENT_LOG_BYTES);
    const oversized = new Blob(['é'.repeat(MAX_CLIENT_LOG_BYTES / 2 + 1)]);
    expect(await readClientLogBytes(oversized.stream())).toBeNull();
  });
  it.each([
    '/api/logs/client',
    '/api/logs/client/',
    '/api/logs/%63lient?x=1',
    '/api/logs/client%2f',
  ])('drops oversized %s before the Pages adapter', async (path) => {
    const request = new Request(`https://tarkovtracker.org${path}`, {
      method: 'POST',
      headers: { 'Content-Length': '1' },
      body: 'x'.repeat(MAX_CLIENT_LOG_BYTES + 1),
    });
    const result = await boundedClientLogRequest(request);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(204);
  });
  it('rebuilds a bounded log request and preserves its body and headers', async () => {
    const request = new Request('https://tarkovtracker.org/api/logs/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Diagnostic': 'keep' },
      body: '{"args":[{"retry":3}]}',
    });
    const result = await boundedClientLogRequest(request);
    expect(result).toBeInstanceOf(Request);
    expect(await (result as Request).text()).toBe('{"args":[{"retry":3}]}');
    expect(result.headers.get('X-Diagnostic')).toBe('keep');
  });
  it.each(['/api/logs/client-other', '/api/security/tarkov-verify', '/bad%path'])(
    'leaves unrelated %s requests untouched',
    async (path) => {
      const request = new Request(`https://tarkovtracker.org${path}`, {
        method: 'POST',
        body: 'x',
      });
      expect(await boundedClientLogRequest(request)).toBe(request);
      expect(request.bodyUsed).toBe(false);
    }
  );
  it('allows depth eight and rejects nine without recursive serialization', () => {
    const nested = (depth: number) => JSON.parse('['.repeat(depth) + '0' + ']'.repeat(depth));
    expect(hasSafeClientLogDepth(nested(9))).toBe(true);
    expect(hasSafeClientLogDepth(nested(10))).toBe(false);
    expect(hasSafeClientLogDepth(nested(10_000))).toBe(false);
  });
});
