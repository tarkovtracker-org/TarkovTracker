import { beforeEach, describe, expect, it, vi } from 'vitest';
const { fetchMock, getQueryMock, setResponseHeadersMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getQueryMock: vi.fn(),
  setResponseHeadersMock: vi.fn(),
}));
vi.mock('h3', () => ({
  createError: (options: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(options.statusMessage), options),
  defineEventHandler: (handler: unknown) => handler,
  getQuery: getQueryMock,
  setResponseHeaders: setResponseHeadersMock,
}));
const loadHandler = async () => {
  vi.resetModules();
  return (await import('@/server/api/tarkov-dev/profile.get')).default as (
    event: unknown
  ) => Promise<unknown>;
};
describe('/api/tarkov-dev/profile', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getQueryMock.mockReset();
    setResponseHeadersMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  it('fetches public profile json from a Tarkov.dev profile url', async () => {
    getQueryMock.mockReturnValue({ url: 'https://tarkov.dev/players/regular/8560316' });
    fetchMock.mockResolvedValue({
      json: async () => ({ aid: 8560316 }),
      ok: true,
      status: 200,
    });
    const handler = await loadHandler();
    await expect(handler({})).resolves.toEqual({ aid: 8560316 });
    expect(fetchMock).toHaveBeenCalledWith('https://players.tarkov.dev/profile/8560316.json', {
      headers: {
        accept: 'application/json',
      },
    });
    expect(setResponseHeadersMock).toHaveBeenCalledWith({}, { 'Cache-Control': 'no-store' });
  });
  it('rejects non-Tarkov.dev profile urls', async () => {
    getQueryMock.mockReturnValue({ url: 'https://example.com/players/regular/8560316' });
    const handler = await loadHandler();
    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
