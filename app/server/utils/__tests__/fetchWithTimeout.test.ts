import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from '@/server/utils/fetchWithTimeout';
describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it.each([204, 205, 304])('preserves an empty body for %s responses', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { headers: { ETag: 'test' }, status }))
    );
    const response = await fetchWithTimeout('https://example.test', {}, 1000, 'timed out');
    expect(response.status).toBe(status);
    await expect(response.text()).resolves.toBe('');
    expect(response.headers.get('ETag')).toBe('test');
  });
});
