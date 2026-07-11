import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKvRestWriter } from '../kv';
const fetchMock = vi.fn();
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
describe('createKvRestWriter', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  const writer = () =>
    createKvRestWriter({ accountId: 'acc-1', apiToken: 'token-1', namespaceId: 'ns-1' });
  it('PUTs the value to the namespaced key with TTL and bearer auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    await writer().put('tasks-core-json-v2-en-regular', '{"payload":1}', {
      expirationTtl: 604800,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc-1/storage/kv/namespaces/ns-1/values/tasks-core-json-v2-en-regular?expiration_ttl=604800'
    );
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"payload":1}');
    expect(init.headers.Authorization).toBe('Bearer token-1');
  });
  it('omits expiration_ttl when no TTL is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    await writer().put('key', 'value');
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('expiration_ttl');
  });
  it('throws with API error details on an unsuccessful response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { errors: [{ code: 10000, message: 'Authentication error' }], success: false },
        403
      )
    );
    await expect(writer().put('key', 'value')).rejects.toThrow(
      'KV write failed for "key": 10000: Authentication error'
    );
  });
  it('throws with the HTTP status when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('bad gateway', { status: 502 }));
    await expect(writer().put('key', 'value')).rejects.toThrow(
      'KV write failed for "key": HTTP 502'
    );
  });
});
