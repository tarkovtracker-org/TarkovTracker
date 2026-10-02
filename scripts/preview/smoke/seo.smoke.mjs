import { expect, test } from '@playwright/test';
import { previewGet, protectPreviewBrowser } from './access.mjs';
import { previewOrigin } from './readiness.mjs';
const origin = previewOrigin();
const canonicalOrigin = 'https://tarkovtracker.org';
const publicExamples = [
  ['/tasks', 'Tarkov Quest Tracker · TarkovTracker.org'],
  ['/supporter', 'Support TarkovTracker.org'],
  ['/kappa', 'Kappa & Lightkeeper Tracker · TarkovTracker.org'],
  ['/resources/tarkovmonitor', 'TarkovMonitor Setup Guide'],
];
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
for (const [route, title] of publicExamples) {
  test(`initial HTML for ${route} owns compact route metadata`, async ({ request }) => {
    const response = await previewGet(request, `${origin}${route}`, origin);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<title>${title.replaceAll('&', '&amp;')}</title>`);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain(`href="${canonicalOrigin}${route}"`);
    expect(html).toMatch(/<h1\b/);
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).not.toMatch(/property="og:image"|name="twitter:image"/);
  });
}
test('private shells are unindexed and unknown routes return 404', async ({ request }) => {
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
  expect(await profile.text()).toContain('name="robots" content="noindex, nofollow"');
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
