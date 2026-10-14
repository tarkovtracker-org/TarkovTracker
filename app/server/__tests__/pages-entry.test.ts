// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import pagesWorker from '@/server/pages-entry';
const { adapterFetch, adapterScheduled } = vi.hoisted(() => ({
  adapterFetch: vi.fn(),
  adapterScheduled: vi.fn(),
}));
// Same Nuxt-resolved transitive adapter alias as pages-entry.ts; Fallow cannot resolve it.
// Typecheck and the compiled-workerd build verify the alias.
// fallow-ignore-next-line unresolved-import
vi.mock('nitropack/presets/cloudflare/runtime/cloudflare-pages', () => ({
  default: { fetch: adapterFetch, scheduled: adapterScheduled },
}));
type FetchArgs = Parameters<typeof pagesWorker.fetch>;
function requestArgs(url: string, init?: RequestInit): FetchArgs {
  const request = new Request(url, init) as FetchArgs[0];
  const env: FetchArgs[1] = {
    ASSETS: { fetch: vi.fn() },
    CF_PAGES: '1',
    CF_PAGES_BRANCH: 'preview',
    CF_PAGES_COMMIT_SHA: 'test',
    CF_PAGES_URL: 'https://preview.pages.dev',
  };
  const context: FetchArgs[2] = {
    request,
    env,
    params: {},
    data: {},
    functionPath: '/',
    next: vi.fn(),
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
  return [request, env, context];
}
describe('Pages entry adapter boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('passes the original Request, environment, context and Response by identity', async () => {
    const args = requestArgs('https://tarkovtracker.org/api/security/tarkov-verify', {
      method: 'POST',
      body: '{invalid json',
    });
    const response = new Response('normal response', {
      status: 418,
      headers: { 'X-Original': '1' },
    });
    adapterFetch.mockResolvedValueOnce(response);
    expect(await pagesWorker.fetch(...args)).toBe(response);
    expect(adapterFetch).toHaveBeenCalledOnce();
    const actual = adapterFetch.mock.calls[0]!;
    args.forEach((argument, index) => {
      expect(actual[index]).toBe(argument);
    });
    expect(args[0].bodyUsed).toBe(false);
    expect(response.bodyUsed).toBe(false);
  });
  it('preserves the installed adapter scheduled callback', () => {
    expect(pagesWorker.scheduled).toBe(adapterScheduled);
  });
  it('returns retirement before the adapter or any body consumption', async () => {
    const args = requestArgs('https://tarkovtracker.org/api/progress', {
      method: 'POST',
      body: 'unread',
    });
    const response = await pagesWorker.fetch(...args);
    expect(response.status).toBe(410);
    expect(args[0].bodyUsed).toBe(false);
    expect(adapterFetch).not.toHaveBeenCalled();
  });
});
