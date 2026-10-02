// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => vi.unstubAllGlobals());
describe('client document HTML metadata', () => {
  it('renders readable 404 content inside an attributed Nuxt root and marks it noindex', async () => {
    vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin);
    const { default: plugin } = await import('@/server/plugins/route-seo');
    const hooks: Record<string, (...args: unknown[]) => unknown> = {};
    await plugin({
      hooks: {
        hook: (name: string, callback: (...args: unknown[]) => unknown) => {
          hooks[name] = callback;
        },
      },
    } as never);
    const html = {
      head: [],
      body: ['<div id="__nuxt" class="isolate"></div><div id="teleports"></div>'],
    };
    hooks['render:html']!(html, { event: { path: '/404.html' } });
    expect(html.head.join('')).toContain('name="robots" content="noindex, nofollow"');
    expect(html.body[0]).toContain('<h1 class="text-2xl font-bold">Page Not Found</h1>');
    expect(html.body[0]).toMatch(/^<div id="__nuxt" class="isolate"><main/);
  });
});
