import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKvRestWriter } from '../kv';
const fetchMock = vi.fn();
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
describe('createKvRestWriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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
  it.each([429, 500, 502, 503, 504])(
    'retries HTTP %s with the same payload and TTL',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ success: false }, status))
        .mockResolvedValueOnce(jsonResponse({ success: true }));
      const pending = writer().put('key', 'value', { expirationTtl: 604800 });
      void pending.catch(() => {});
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [firstUrl, firstInit] = fetchMock.mock.calls[0];
      const [retryUrl, retryInit] = fetchMock.mock.calls[1];
      expect(String(retryUrl)).toBe(String(firstUrl));
      expect(retryInit.body).toBe(firstInit.body);
      expect(retryInit.headers).toEqual(firstInit.headers);
      expect(retryInit.signal).not.toBe(firstInit.signal);
    }
  );
  it('recovers from Cloudflare error 7009 even with HTTP 200', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          success: false,
          errors: [{ code: 7009, message: 'Upstream service unavailable' }],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const pending = writer().put('key', 'value');
    void pending.catch(() => {});
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([new TypeError('fetch failed'), new DOMException('timed out', 'TimeoutError')])(
    'retries transport errors: %s',
    async (error) => {
      fetchMock.mockRejectedValueOnce(error).mockResolvedValueOnce(jsonResponse({ success: true }));
      const pending = writer().put('key', 'value');
      void pending.catch(() => {});
      await vi.runAllTimersAsync();
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );
  it.each([new TypeError('terminated'), new DOMException('timed out', 'TimeoutError')])(
    'retries body transport failures after HTTP 200 headers: %s',
    async (error) => {
      const response = jsonResponse({ success: true });
      vi.spyOn(response, 'json').mockRejectedValue(error);
      fetchMock
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(jsonResponse({ success: true }));
      const pending = writer().put('key', 'value');
      void pending.catch(() => {});
      await vi.runAllTimersAsync();
      await pending;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );
  it('preserves the body transport error when retries are exhausted', async () => {
    const error = new TypeError('terminated');
    fetchMock.mockImplementation(() => {
      const response = jsonResponse({ success: true });
      vi.spyOn(response, 'json').mockRejectedValue(error);
      return Promise.resolve(response);
    });
    const assertion = expect(writer().put('key', 'value')).rejects.toMatchObject({
      message: 'KV write failed for "key": terminated',
      cause: error,
    });
    void assertion.catch(() => {});
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('does not retry malformed JSON on HTTP 200', async () => {
    fetchMock.mockResolvedValue(new Response('invalid JSON'));
    await expect(writer().put('key', 'value')).rejects.toThrow('HTTP 200');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('bounds transport retries and preserves the final cause', async () => {
    const error = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(error);
    const assertion = expect(writer().put('key', 'value')).rejects.toMatchObject({
      message: 'KV write failed for "key": fetch failed',
      cause: error,
    });
    void assertion.catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('does not retry an unsuccessful HTTP 200 response without a transient code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }));
    await expect(writer().put('key', 'value')).rejects.toThrow('HTTP 200');
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('throws with the HTTP status when the body is not JSON', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('bad gateway', { status: 502 }))
    );
    const assertion = expect(writer().put('key', 'value')).rejects.toThrow(
      'KV write failed for "key": HTTP 502'
    );
    void assertion.catch(() => {});
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
