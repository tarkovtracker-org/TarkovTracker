import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { previewGet, protectPreviewBrowser } from './access.mjs';
import { previewOrigin } from './readiness.mjs';
const origin = previewOrigin();
const canonicalOrigin = 'https://tarkovtracker.org';
const publicPages = {
  '/': 'home',
  '/tasks': 'tasks',
  '/hideout': 'hideout',
  '/needed-items': 'needed_items',
  '/kappa': 'kappa',
  '/storyline': 'storyline',
  '/resources': 'resources',
  '/about': 'about',
  '/credits': 'credits',
  '/changelog': 'changelog',
  '/supporter': 'supporter',
  '/privacy': 'privacy',
  '/terms-of-service': 'terms_of_service',
  '/resources/tarkovtracker_org_vs_io': 'tarkovtracker_org_vs_io',
  '/resources/tarkovmonitor': 'tarkovmonitor',
  '/resources/ratscanner': 'ratscanner',
  '/resources/tarkovdev': 'tarkovdev',
  '/resources/cultistcircle': 'cultistcircle',
};
const privatePages = {
  '/settings': 'settings',
  '/progression': 'progression',
  '/prestige': 'prestige',
  '/preferences': 'preferences',
  '/account': 'account',
  '/team': 'team',
  '/admin': 'admin',
  '/profile': 'profile',
  '/login': 'login',
  '/auth/callback': 'auth_callback',
  '/oauth/consent': 'oauth_consent',
  '/not-found': 'not_found',
};
const english = JSON.parse(
  readFileSync(new URL('../../../app/locales/en.json', import.meta.url), 'utf8')
);
const discordUserAgent = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const discordFetch = (url, options) =>
  fetch(url, {
    ...options,
    headers: { ...options.headers, 'User-Agent': discordUserAgent },
  });
test.use({ userAgent: discordUserAgent });
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
// DOMParser reads the original HTML without running scripts or hydrating Vue.
async function readMetadata(page, html) {
  const document = await page.evaluate((source) => {
    const document = new DOMParser().parseFromString(source, 'text/html');
    return {
      meta: [...document.head.querySelectorAll('meta')].map((tag) => [
        tag.getAttribute('name') ?? tag.getAttribute('property'),
        tag.getAttribute('content') ?? tag.getAttribute('value'),
      ]),
      titles: [...document.head.querySelectorAll('title')].map((tag) => tag.textContent),
      canonicals: [...document.head.querySelectorAll('link[rel="canonical"]')].map((tag) =>
        tag.getAttribute('href')
      ),
      hasHeading: Boolean(document.querySelector('h1')),
    };
  }, html);
  const meta = {};
  for (const [key, value] of document.meta) (meta[key] ??= []).push(value);
  return { ...document, meta };
}
function assertSocialMetadata(meta, copy, route) {
  const title = copy.title.replace(/ · TarkovTracker\.org$/, '');
  expect(meta['og:title']).toEqual([title]);
  expect(meta['twitter:title']).toEqual([title]);
  expect(meta['og:description']).toEqual([copy.description]);
  expect(meta['twitter:description']).toEqual([copy.description]);
  expect(meta['og:site_name']).toEqual([english.seo.site_name]);
  expect(meta['theme-color']).toEqual(['#c8a882']);
  expect(meta['twitter:card']).toEqual(['summary']);
  expect(meta['og:type']).toEqual([route.startsWith('/resources/') ? 'article' : 'website']);
  expect(meta['og:image']).toBeUndefined();
  expect(meta['twitter:image']).toBeUndefined();
  expect(Buffer.byteLength(title)).toBeLessThanOrEqual(70);
  expect(Buffer.byteLength(copy.description)).toBeLessThanOrEqual(350);
}
function assertIndexing({ meta, hasHeading }, route) {
  const isPublic = route in publicPages;
  expect(meta.robots).toEqual([isPublic ? 'index, follow' : 'noindex, nofollow']);
  if (isPublic) expect(hasHeading).toBe(true);
}
function assertCanonical({ meta, canonicals }, route) {
  const canonical = route === '/profile' ? [] : [`${canonicalOrigin}${route}`];
  expect(canonicals).toEqual(canonical);
  expect(meta['og:url'] ?? []).toEqual(canonical);
}
for (const [route, key] of Object.entries({ ...publicPages, ...privatePages })) {
  test(`Discord initial HTML metadata for ${route}`, async ({ page, request }) => {
    const response = await previewGet(request, `${origin}${route}`, origin, discordFetch, 10000);
    expect(response.status()).toBe(200);
    const document = await readMetadata(page, await response.text());
    const copy = english.seo.routes[key];
    expect(document.titles).toEqual([copy.title]);
    assertSocialMetadata(document.meta, copy, route);
    assertIndexing(document, route);
    assertCanonical(document, route);
  });
}
test('filter queries retain the clean route preview', async ({ page, request }) => {
  for (const route of ['/tasks?search=private-filter', '/tasks?lang=de&v=discord-test']) {
    const response = await previewGet(request, `${origin}${route}`, origin, discordFetch, 10000);
    expect(response.status()).toBe(200);
    const { meta, canonicals } = await readMetadata(page, await response.text());
    expect(meta['og:title']).toEqual(['Tarkov Quest Tracker']);
    expect(meta['og:url']).toEqual([`${canonicalOrigin}/tasks`]);
    expect(canonicals).toEqual([`${canonicalOrigin}/tasks`]);
    expect(JSON.stringify(meta)).not.toContain('private-filter');
  }
});
test('trailing slashes redirect to the clean page before Discord reads its metadata', async ({
  request,
}) => {
  for (const route of ['/tasks/', '/tasks/?search=private-filter']) {
    const response = await previewGet(request, `${origin}${route}`, origin, discordFetch, 10000);
    expect(response.status()).toBe(308);
  }
});
test('private shells are unindexed and unknown routes return 404', async ({ page, request }) => {
  for (const route of ['/account', '/settings', '/login', '/auth/callback', '/profile']) {
    const response = await previewGet(request, `${origin}${route}`, origin);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('name="robots" content="noindex, nofollow"');
  }
  for (const route of ['/unknown-seo-smoke', '/resources/no-such-guide', '/profile/invalid/pvp']) {
    const response = await previewGet(request, `${origin}${route}`, origin);
    expect(response.status()).toBe(404);
  }
  const profile = await previewGet(
    request,
    `${origin}/profile/11111111-1111-4111-8111-111111111111/pve`,
    origin
  );
  expect(profile.status()).toBe(200);
  const profileHtml = await profile.text();
  expect(profileHtml).toContain('name="robots" content="noindex, nofollow"');
  const profileMetadata = await readMetadata(page, profileHtml);
  expect(profileMetadata.canonicals).toEqual([]);
  expect(profileMetadata.meta['og:url']).toBeUndefined();
  expect(profileMetadata.meta['og:title']).toEqual(['Player Profile']);
  expect(JSON.stringify(profileMetadata.meta)).not.toContain('11111111');
});
test('legacy aliases remain HTTP 301 redirects', async ({ request }) => {
  for (const route of ['/neededitems', '/streamer-tools']) {
    const response = await previewGet(request, `${origin}${route}`, origin);
    expect(response.status()).toBe(301);
  }
});
test('public to private to public navigation restores metadata', async ({ page }) => {
  await page.goto(`${origin}/resources/tarkovmonitor`, { waitUntil: 'networkidle' });
  await page.locator('footer a[href="/tasks"]').click();
  await expect(page).toHaveTitle('Tarkov Quest Tracker · TarkovTracker.org');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await page.locator('footer a[href="/team"]').click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.locator('footer a[href="/tasks"]').click();
  await expect(page).toHaveTitle('Tarkov Quest Tracker · TarkovTracker.org');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${canonicalOrigin}/tasks`
  );
  await expect(page.locator('meta[property="og:image"], meta[name="twitter:image"]')).toHaveCount(
    0
  );
});
