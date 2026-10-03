import { expect, test } from '@playwright/test';
import { previewGet, protectPreviewBrowser } from './access.mjs';
import { MANIFEST_FILE, PAGES_DOMAIN } from '../profile.mjs';
import { isForbiddenRequest, previewOrigin, requiredEnv, waitForDeployment } from './readiness.mjs';
const origin = previewOrigin();
const expectedHeadSha = requiredEnv('EXPECTED_HEAD_SHA');
const expectedDigest = requiredEnv('EXPECTED_DIGEST');
const expectedBranch = requiredEnv('EXPECTED_PREVIEW_BRANCH');
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.setTimeout(6 * 60 * 1000);
  await waitForDeployment(origin);
});
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
const ASSET_PATTERN = /\.(m?js|css)(\?|$)/;
function failureText(request) {
  return request.failure()?.errorText ?? 'failed';
}
function recordFailedAsset(record, request) {
  const url = request.url();
  if (url.startsWith(origin) && ASSET_PATTERN.test(url))
    record.failedAssets.push(`${url}: ${failureText(request)}`);
}
/** Collect browser-side failures for one page visit. */
function observe(page) {
  const record = { pageErrors: [], failedAssets: [], forbidden: [] };
  page.on('pageerror', (error) => record.pageErrors.push(String(error)));
  page.on('requestfailed', (request) => recordFailedAsset(record, request));
  page.on('request', (request) => {
    if (isForbiddenRequest(request.url())) record.forbidden.push(request.url());
  });
  return record;
}
async function expectUsableApplication(page, record) {
  await expect(page.locator('#__nuxt')).toBeAttached();
  await expect(page.locator('main#main-content')).toBeVisible();
  await expect
    .poll(async () => (await page.locator('#__nuxt').innerText()).trim().length, {
      timeout: 60_000,
    })
    .toBeGreaterThan(20);
  expect(record.pageErrors, 'uncaught page errors').toEqual([]);
  expect(record.failedAssets, 'failed JavaScript/CSS assets').toEqual([]);
  expect(record.forbidden, 'production service requests').toEqual([]);
}
test('deployment serves the verified preview manifest', async ({ request }) => {
  expect(new URL(origin).hostname.endsWith(`.${PAGES_DOMAIN}`)).toBe(true);
  const response = await previewGet(request, `${origin}/${MANIFEST_FILE}`, origin);
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.headSha).toBe(expectedHeadSha);
  expect(manifest.digest).toBe(expectedDigest);
  expect(manifest.previewBranch).toBe(expectedBranch);
  expect(manifest.profile).toBe('preview');
});
test('home page renders usable application content without production services', async ({
  page,
}) => {
  const record = observe(page);
  const response = await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(origin);
  await expectUsableApplication(page, record);
});
test('direct /tasks navigation renders usable application content', async ({ page }) => {
  const record = observe(page);
  const response = await page.goto(`${origin}/tasks`, { waitUntil: 'networkidle' });
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).origin).toBe(origin);
  await expectUsableApplication(page, record);
});
for (const width of [333, 400, 1280]) {
  test(`Needed Items source tabs retain accessible names at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const record = observe(page);
    await page.goto(`${origin}/needed-items`, { waitUntil: 'networkidle' });
    await expectUsableApplication(page, record);
    const tablist = page.getByRole('tablist').first();
    const tabs = ['All', 'Tasks', 'Hideout'].map((label) =>
      tablist.getByRole('tab', { name: new RegExp(`^${label}\\s+\\d+$`, 'i') })
    );
    for (const tab of tabs) await expect(tab).toBeVisible();
    await expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    await tabs[0].focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('input[name="needed-items-search"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(tabs[0]).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tabs[1]).toBeFocused();
    await expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    await expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    const focus = await tabs[1].evaluate((tab) => ({
      visible: tab.matches(':focus-visible'),
      outlineWidth: getComputedStyle(tab).outlineWidth,
      outlineStyle: getComputedStyle(tab).outlineStyle,
    }));
    expect(focus.visible).toBe(true);
    expect(parseFloat(focus.outlineWidth)).toBeGreaterThan(0);
    expect(focus.outlineStyle).not.toBe('none');
    await page.keyboard.press('ArrowRight');
    await expect(tabs[2]).toBeFocused();
    await expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tabs[1]).toBeFocused();
    await expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });
}
test('cache-meta returns the anonymous fallback shape', async ({ request }) => {
  const response = await previewGet(request, `${origin}/api/tarkov/cache-meta`, origin);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ data: { lastPurgeAt: null } });
});
test('bootstrap returns nonempty public game data', async ({ request }) => {
  const response = await previewGet(request, `${origin}/api/tarkov/bootstrap?lang=en`, origin);
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body?.data?.playerLevels)).toBe(true);
  expect(body.data.playerLevels.length).toBeGreaterThan(0);
  const level = body.data.playerLevels[0];
  expect(typeof level.level).toBe('number');
});
