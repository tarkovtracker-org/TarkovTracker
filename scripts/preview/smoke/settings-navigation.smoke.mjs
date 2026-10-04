import { expect, test } from '@playwright/test';
import { protectPreviewBrowser } from './access.mjs';
import { previewOrigin } from './readiness.mjs';
const origin = previewOrigin();
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
async function navigate(page, path) {
  // Use the real SPA router so the route watcher and Nuxt hash scrolling both run.
  await page.evaluate(
    (to) => document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push(to),
    path
  );
}
async function expectActiveTabVisible(page, name, focused = false) {
  const tab = page.getByRole('tab', { name, exact: true });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  if (focused) await expect(tab).toBeFocused();
  const isVisible = () =>
    tab.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const list = element.closest('[role="tablist"]').getBoundingClientRect();
      const header = document.querySelector('header').getBoundingClientRect();
      const style = getComputedStyle(element);
      const ring = parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset));
      return [
        rect.top - ring >= header.bottom,
        rect.bottom + ring <= innerHeight,
        rect.left - ring >= list.left,
        rect.right + ring <= list.right,
        element.contains(
          document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        ),
      ].every(Boolean);
    });
  await expect.poll(isVisible).toBe(true);
  // Wait past smooth scrolling, then repeat the geometry assertion: an intermediate pass is insufficient.
  await page.waitForTimeout(600);
  expect(await isVisible(), 'full tab and focus ring remain visible after scrolling settles').toBe(
    true
  );
  const geometry = await tab.evaluate((element) => ({
    tab: element.getBoundingClientRect().toJSON(),
    headerBottom: document.querySelector('header').getBoundingClientRect().bottom,
    scrollY,
    focusVisible: element.matches(':focus-visible'),
  }));
  expect(geometry.tab.top).toBeGreaterThanOrEqual(geometry.headerBottom + 3);
  if (focused) expect(geometry.focusVisible).toBe(true);
  console.log(JSON.stringify({ viewport: page.viewportSize(), name, ...geometry }));
}
async function expectNestedTarget(page, hash, panel) {
  await expect(page.locator(panel)).toBeVisible();
  await expect
    .poll(() =>
      page.locator(hash).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.top >= document.querySelector('header').getBoundingClientRect().bottom &&
          rect.top < innerHeight
        );
      })
    )
    .toBe(true);
}
for (const viewport of [
  { width: 400, height: 609 },
  { width: 333, height: 507 },
]) {
  test.describe(`${viewport.width}px settings navigation`, () => {
    test.use({ viewport });
    test('pointer and arrow activation preserve visible labels, focus, query and replace history', async ({
      page,
    }) => {
      await page.goto(`${origin}/settings?navigation-test=1043`);
      const progression = page.getByRole('tab', { name: 'Progression', exact: true });
      await progression.focus();
      const historyLength = await page.evaluate(() => history.length);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expectActiveTabVisible(page, 'Preferences', true);
      await expect(page.locator('#preferences')).toBeVisible();
      await page.keyboard.press('ArrowLeft');
      await expectActiveTabVisible(page, 'Prestige', true);
      for (const name of [
        'Backup & Restore',
        'API',
        'Progression',
        'Preferences',
        'Backup & Restore',
      ]) {
        await page.keyboard.press('Control+Home');
        await page.getByRole('tab', { name, exact: true }).click();
        await expectActiveTabVisible(page, name);
      }
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
      expect(new URL(page.url()).searchParams.get('navigation-test')).toBe('1043');
      await page.reload();
      await expectActiveTabVisible(page, 'Backup & Restore');
    });
    test('rapid switches from a scrolled panel settle on the latest visible tab', async ({
      page,
    }) => {
      await page.goto(`${origin}/settings#keybinds`);
      await expectNestedTarget(page, '#keybinds', '#preferences');
      await page.getByRole('tab', { name: 'Preferences', exact: true }).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      await expectActiveTabVisible(page, 'Backup & Restore', true);
      await expect(page.locator('#backup-restore')).toBeVisible();
      await expect(page).toHaveURL(/#backup-restore$/);
    });
    test('Seasonal hidden-Prestige links retain the visible Progression fallback', async ({
      page,
    }) => {
      await page.goto(`${origin}/settings#preferences`);
      await expect(page.locator('#preferences')).toBeVisible();
      await page.evaluate(() => {
        document
          .querySelector('#__nuxt')
          .__vue_app__.config.globalProperties.$pinia._s.get('swapTarkov').currentGameMode =
          'seasonal';
      });
      await expect(page.getByRole('tab', { name: 'Prestige', exact: true })).toHaveCount(0);
      await navigate(page, '/settings?navigation-test=1043#prestige');
      await expect(page).toHaveURL(/navigation-test=1043#progression$/);
      await expectActiveTabVisible(page, 'Progression');
      await page.goto(`${origin}/settings#prestige`);
      await expect(page).toHaveURL(/#progression$/);
      await expectActiveTabVisible(page, 'Progression');
      await navigate(page, '/settings#settings-prestige');
      await expectActiveTabVisible(page, 'Progression');
      await expect(page.locator('#progression')).toBeVisible();
    });
    test('initial and SPA deep links, legacy aliases, refresh and Back/Forward retain targets', async ({
      page,
    }) => {
      await page.goto(`${origin}/settings#skills`);
      await expectNestedTarget(page, '#skills', '#progression');
      await page.reload();
      await expectNestedTarget(page, '#skills', '#progression');
      await navigate(page, '/settings#keybinds');
      await expectNestedTarget(page, '#keybinds', '#preferences');
      await page.goBack();
      await expectNestedTarget(page, '#skills', '#progression');
      await page.goForward();
      await expectNestedTarget(page, '#keybinds', '#preferences');
      for (const [hash, name] of [
        ['#settings-preferences', 'Preferences'],
        ['#data-management', 'Imports'],
        ['#settings-backup-restore', 'Backup & Restore'],
        ['#api', 'API'],
      ]) {
        await navigate(page, `/settings${hash}`);
        await expectActiveTabVisible(page, name);
      }
      await navigate(page, '/settings#settings-skills');
      await expectNestedTarget(page, '#skills', '#progression');
      await expect(page).toHaveURL(/#settings-skills$/);
    });
  });
}
test('desktop retains panel scrolling and sticky navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 761 });
  await page.goto(`${origin}/settings#progression`);
  await page.getByTestId('desktop-tab-preferences').click();
  await expect(page.locator('#preferences')).toBeVisible();
  await expect(page.getByTestId('desktop-tab-preferences')).toHaveAttribute('aria-current', 'page');
  await expect
    .poll(() =>
      page
        .locator('#preferences')
        .evaluate((element) => Math.round(element.getBoundingClientRect().top))
    )
    .toBe(96);
  await navigate(page, '/settings#keybinds');
  await expectNestedTarget(page, '#keybinds', '#preferences');
  await expect(page.getByTestId('desktop-tab-preferences')).toBeVisible();
});
