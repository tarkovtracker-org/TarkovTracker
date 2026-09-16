import { vi } from 'vitest';
import type { H3EventContext } from 'h3';
type SiteConfigStackEntry = Record<string, unknown>;
// Nuxt site config is injected into server event context; server route tests
// stub the minimal shape the routes rely on.
export const BASE_SITE_CONTEXT: Pick<H3EventContext, 'siteConfig' | 'siteConfigNitroOrigin'> = {
  siteConfig: {
    stack: [] as Partial<SiteConfigStackEntry>[],
    push: vi.fn(() => () => {}),
    get: vi.fn(() => ({})),
  },
  siteConfigNitroOrigin: '',
};
// Router stub matching the `useRouter` surface touched by server route tests.
export const createRouterStub = () => ({
  afterEach: vi.fn(),
  beforeEach: vi.fn(),
  beforeResolve: vi.fn(),
  onError: vi.fn(),
});
// Minimal Cache API implementation shared by server cache integration tests.
export const stubEdgeCache = () => {
  const entries = new Map<string, Response>();
  vi.stubGlobal('caches', {
    default: {
      match: async (request: Request) => entries.get(request.url)?.clone(),
      put: async (request: Request, response: Response) => {
        entries.set(request.url, response.clone());
      },
    },
  });
  return entries;
};
