import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RESOURCES } from '@/features/resources/resourceData';
import {
  CLIENT_DOCUMENT_ROUTES,
  PUBLIC_SEO_ROUTES,
  SEO_ORIGIN,
  createRouteSeoHead,
  resolveRouteSeo,
} from '@/utils/routeSeo';
describe('route SEO registry', () => {
  it('uses the chosen compact previews for tasks, supporter, and combined Kappa/Lightkeeper', () => {
    expect(resolveRouteSeo('/tasks').title).toBe('Tarkov Quest Tracker · TarkovTracker.org');
    expect(resolveRouteSeo('/supporter').description).toBe(
      'Help fund hosting and development. Explore supporter tiers and ways to contribute.'
    );
    expect(resolveRouteSeo('/kappa').title).toBe('Kappa & Lightkeeper Tracker · TarkovTracker.org');
  });
  it('keeps browser titles while avoiding a repeated brand in social titles', () => {
    const head = createRouteSeoHead('/tasks');
    expect(head.title).toBe('Tarkov Quest Tracker · TarkovTracker.org');
    expect(head.meta).toContainEqual(
      expect.objectContaining({ property: 'og:title', content: 'Tarkov Quest Tracker' })
    );
    expect(head.meta).toContainEqual(
      expect.objectContaining({ name: 'twitter:title', content: 'Tarkov Quest Tracker' })
    );
    expect(head.meta).toContainEqual(
      expect.objectContaining({ property: 'og:site_name', content: 'TarkovTracker' })
    );
    expect(createRouteSeoHead('/supporter').meta).toContainEqual(
      expect.objectContaining({ property: 'og:title', content: 'Support TarkovTracker.org' })
    );
  });
  it('includes exactly the public pages and every available guide', () => {
    expect(PUBLIC_SEO_ROUTES).toHaveLength(18);
    expect(new Set(PUBLIC_SEO_ROUTES).size).toBe(18);
    for (const resource of RESOURCES) {
      expect(PUBLIC_SEO_ROUTES.includes(`/resources/${resource.slug}`)).toBe(resource.hasGuide);
    }
    for (const path of PUBLIC_SEO_ROUTES) {
      expect(resolveRouteSeo(path)).toMatchObject({
        indexable: true,
        canonical: `${SEO_ORIGIN}${path}`,
      });
    }
  });
  it('normalizes query, hash, and trailing slash without indexing unknown URLs', () => {
    expect(resolveRouteSeo('/tasks/?search=secret#objective')).toEqual(resolveRouteSeo('/tasks'));
    expect(resolveRouteSeo('/resources/tarkovchanges').indexable).toBe(false);
    expect(resolveRouteSeo('/unknown').indexable).toBe(false);
    for (const path of CLIENT_DOCUMENT_ROUTES) expect(resolveRouteSeo(path).indexable).toBe(false);
    expect(new Set(CLIENT_DOCUMENT_ROUTES.map((path) => resolveRouteSeo(path).title)).size).toBe(
      CLIENT_DOCUMENT_ROUTES.length
    );
  });
  it('omits personalized profile canonicals and excludes query values from head output', () => {
    for (const path of ['/profile', '/profile/private-user/pve?token=secret']) {
      const head = createRouteSeoHead(path);
      expect(head.link).toEqual([]);
      expect(head.meta.some((tag) => 'property' in tag && tag.property === 'og:url')).toBe(false);
      expect(JSON.stringify(head)).not.toContain('private-user');
      expect(JSON.stringify(head)).not.toContain('secret');
    }
  });
  it('produces initial noindex shells and restores indexable public metadata', () => {
    const privateHead = createRouteSeoHead('/account');
    const publicHead = createRouteSeoHead('/tasks');
    expect(privateHead.meta).toContainEqual(
      expect.objectContaining({ name: 'robots', content: 'noindex, nofollow' })
    );
    expect(publicHead.meta).toContainEqual(
      expect.objectContaining({ name: 'robots', content: 'index, follow' })
    );
    expect(privateHead.title).not.toEqual(publicHead.title);
    expect(publicHead.titleTemplate).toBeNull();
  });
  it('only emits explicitly configured images and removes them from the next route head', () => {
    const resource = RESOURCES.find((entry) => entry.slug === 'tarkovmonitor');
    if (!resource?.hasGuide) throw new Error('Expected TarkovMonitor guide');
    const original = resource.guide.shareImage;
    resource.guide.shareImage = {
      src: '/test-guide.webp',
      width: 1200,
      height: 630,
      altKey: 'seo.routes.tarkovmonitor.title',
    };
    try {
      const guideHead = createRouteSeoHead('/resources/tarkovmonitor');
      expect(guideHead.meta).toContainEqual(
        expect.objectContaining({ property: 'og:image', content: `${SEO_ORIGIN}/test-guide.webp` })
      );
      expect(guideHead.meta).toContainEqual(
        expect.objectContaining({ property: 'og:image:width', content: '1200' })
      );
      expect(guideHead.meta).toContainEqual(
        expect.objectContaining({ name: 'twitter:image:width', content: '1200' })
      );
      expect(guideHead.meta).toContainEqual(
        expect.objectContaining({ name: 'twitter:image:height', content: '630' })
      );
      const twitterImageIndex = guideHead.meta.findIndex((tag) => tag.key === 'twitter:image');
      expect(
        guideHead.meta.slice(twitterImageIndex + 1, twitterImageIndex + 3).map((tag) => tag.key)
      ).toEqual(['twitter:image:width', 'twitter:image:height']);
      const appHead = createRouteSeoHead('/tasks');
      expect(appHead.meta.some((tag) => tag.key?.includes('image'))).toBe(false);
      expect(appHead.meta).toContainEqual(
        expect.objectContaining({ name: 'twitter:card', content: 'summary' })
      );
    } finally {
      resource.guide.shareImage = original;
    }
  });
  it('emits homepage application and guide article/breadcrumb schemas', () => {
    const home = JSON.parse(createRouteSeoHead('/').script[0]!.innerHTML);
    expect(home['@graph'].map((entry: { '@type': string }) => entry['@type'])).toEqual([
      'Organization',
      'WebSite',
      'WebApplication',
    ]);
    const guide = JSON.parse(createRouteSeoHead('/resources/ratscanner').script[0]!.innerHTML);
    expect(guide['@graph'].map((entry: { '@type': string }) => entry['@type'])).toEqual([
      'Organization',
      'WebSite',
      'Article',
      'BreadcrumbList',
    ]);
    expect(guide['@graph'][3].itemListElement[2].item).toBe(`${SEO_ORIGIN}/resources/ratscanner`);
  });
  it('keeps the llms public inventory aligned and permits crawlers to read private noindex HTML', () => {
    const llms = readFileSync('public/llms.txt', 'utf8');
    const inventory = [...llms.matchAll(/\]\((https:\/\/tarkovtracker\.org[^)]*)\):/g)].map(
      (match) => new URL(match[1]!).pathname
    );
    expect(inventory.filter((path) => !path.startsWith('/api/')).sort()).toEqual(
      [...PUBLIC_SEO_ROUTES].sort()
    );
    const robots = readFileSync('public/robots.txt', 'utf8');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Disallow: /overlay');
    expect(robots).not.toMatch(/Disallow: \/(?:account|profile|settings|team|auth|login)/);
  });
});
