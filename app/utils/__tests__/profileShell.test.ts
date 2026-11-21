// @vitest-environment happy-dom
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHandleProfileShellPath, isPublicProfileShellPath } from '@/utils/profileShell';
import type { H3Event } from 'h3';
const { headers, fetchAsset } = vi.hoisted(() => ({
  headers: vi.fn(),
  fetchAsset: vi.fn(),
}));
vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  createError: (input: { statusCode: number; message: string }) =>
    Object.assign(new Error(input.message), input),
  setResponseHeaders: headers,
}));
mockNuxtImport('useRuntimeConfig', () => () => ({ public: {} }));
const uuid = '11111111-1111-4111-8111-111111111111';
const profilePath = `/profile/${uuid}/pvp`;
const event = (path: string, binding: unknown = { fetch: fetchAsset }, method = 'GET') =>
  ({ path, method, context: { cloudflare: { env: { ASSETS: binding } } } }) as unknown as H3Event;
describe('profile shell paths', () => {
  it.each(['/@rat_one', '/@rat_one/pve', '/@rat_one/seasonal'])('accepts %s', (path) => {
    expect(isHandleProfileShellPath(path)).toBe(true);
  });
  it.each([
    '/@',
    '/@123',
    '/@RAT',
    '/@rat/',
    '/@rat%2fpvp',
    '/@rat/pve/x',
    '/@rat/pvp-season',
    '/@rat\n',
  ])('rejects malformed handle URL %s', (path) =>
    expect(isHandleProfileShellPath(path)).toBe(false)
  );
  it.each(['pvp', 'pve', 'seasonal'])('accepts %s profiles', (mode) => {
    expect(isPublicProfileShellPath(`/profile/${uuid}/${mode}`)).toBe(true);
  });
  it('accepts uppercase UUID hex', () => {
    expect(isPublicProfileShellPath('/profile/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/pvp')).toBe(
      true
    );
  });
  it.each([
    '/profile',
    '/profile/',
    '/profile/index.html',
    `/profile/${uuid}`,
    `/profile/${uuid}/pvp/`,
    `/profile/${uuid}/pvp\n`,
    `/profile/${uuid}/pvp/extra`,
    `/profile/${uuid}/PVP`,
    `/PROFILE/${uuid}/pvp`,
    `/profile/${uuid}/pvp-season`,
    `/profile/${uuid}%2fpvp`,
    `/profile/${uuid}/%70vp`,
    `/profile/${uuid}/pvp?mode=pve`,
    '/profile/not-a-uuid/pvp',
  ])('rejects %s', (path) => {
    expect(isPublicProfileShellPath(path)).toBe(false);
  });
});
describe('profile shell handler', () => {
  beforeEach(() => {
    headers.mockClear();
    fetchAsset.mockReset();
    fetchAsset.mockResolvedValue(
      new Response('<html>shell</html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );
  });
  it('serves the finite profile entry shell at its trailing-slash asset URL', async () => {
    const { default: handler } = await import('@/server/routes/profile/[...path].get');
    await expect(handler(event('/profile/'))).resolves.toBe('<html>shell</html>');
  });
  it('leaves unrelated paths and methods to other handlers', async () => {
    const { default: handler } = await import('@/server/middleware/profile-handle-shell');
    expect(handler(event('/tasks'))).toBeUndefined();
    expect(handler(event('/@rat_one', undefined, 'POST'))).toBeUndefined();
    expect(fetchAsset).not.toHaveBeenCalled();
  });
  it.each(['GET', 'HEAD'])(
    'serves handle %s through the fixed no-store profile shell',
    async (method) => {
      const { default: handler } = await import('@/server/middleware/profile-handle-shell');
      await expect(handler(event('/@rat_one/pve?user=ignored', undefined, method))).resolves.toBe(
        '<html>shell</html>'
      );
      expect(fetchAsset.mock.calls[0]?.[0].url).toBe('https://assets.local/profile');
      expect(headers).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        })
      );
    }
  );
  it.each(['fetch', 'body'])('returns 503 when the shell %s fails', async (stage) => {
    const failure = new Error('asset unavailable');
    if (stage === 'fetch') fetchAsset.mockRejectedValueOnce(failure);
    else
      fetchAsset.mockResolvedValueOnce({
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/html' }),
        text: vi.fn().mockRejectedValue(failure),
      });
    const { default: handler } = await import('@/server/middleware/profile-handle-shell');
    await expect(handler(event('/@rat_one'))).rejects.toMatchObject({ statusCode: 503 });
  });
  it('registers the same bounded handler for HEAD requests', async () => {
    const { default: getHandler } = await import('@/server/routes/profile/[...path].get');
    const { default: headHandler } = await import('@/server/routes/profile/[...path].head');
    expect(headHandler).toBe(getHandler);
  });
  it('fetches only the fixed asset without propagating query parameters', async () => {
    const { default: handler } = await import('@/server/routes/profile/[...path].get');
    await expect(handler(event(`${profilePath}?redirect=https://example.com`))).resolves.toBe(
      '<html>shell</html>'
    );
    const request = fetchAsset.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe('https://assets.local/profile');
    expect(request.method).toBe('GET');
    expect([...request.headers]).toEqual([]);
    expect(headers.mock.calls[0]?.[1]).toMatchObject({
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': expect.stringContaining("frame-ancestors 'self'"),
    });
  });
  it('returns an unindexed 404 before asset access for invalid paths', async () => {
    const { default: handler } = await import('@/server/routes/profile/[...path].get');
    await expect(handler(event('/profile/invalid/pvp'))).rejects.toMatchObject({ statusCode: 404 });
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(headers.mock.calls[0]?.[1]['X-Robots-Tag']).toBe('noindex, nofollow');
  });
  it('fails closed when the binding is missing', async () => {
    const { default: handler } = await import('@/server/routes/profile/[...path].get');
    await expect(handler(event(profilePath, null))).rejects.toMatchObject({ statusCode: 503 });
  });
  it.each([301, 404])('does not serve an asset response with status %s', async (status) => {
    fetchAsset.mockResolvedValue(new Response('', { status }));
    const { default: handler } = await import('@/server/routes/profile/[...path].get');
    await expect(handler(event(profilePath))).rejects.toMatchObject({ statusCode: 503 });
  });
  it('rejects non-HTML assets', async () => {
    fetchAsset.mockResolvedValue(
      new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    );
    const { default: handler } = await import('@/server/routes/profile/[...path].get');
    await expect(handler(event(profilePath))).rejects.toMatchObject({ statusCode: 503 });
  });
});
