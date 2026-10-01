// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
const { setResponseHeaderMock } = vi.hoisted(() => ({ setResponseHeaderMock: vi.fn() }));
vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  setResponseHeader: setResponseHeaderMock,
}));
describe('/api/tarkov/access-check', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('answers an uncached ok without upstream requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('$fetch', fetchMock);
    const { default: handler } = await import('@/server/api/tarkov/access-check.get');
    const event = {} as H3Event;
    expect(await handler(event)).toEqual({ ok: true });
    expect(setResponseHeaderMock).toHaveBeenCalledTimes(1);
    expect(setResponseHeaderMock).toHaveBeenCalledWith(event, 'Cache-Control', 'no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
