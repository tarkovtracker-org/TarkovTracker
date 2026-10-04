import { expect, test } from '@playwright/test';
import { protectPreviewBrowser } from './access.mjs';
const origin = new URL(process.env.PREVIEW_URL).origin;
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
async function expectPointerTarget(control) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  const bounds = await control.evaluate((element) => ({
    control: element.getBoundingClientRect().toJSON(),
    card: element.closest('.overflow-hidden.rounded-lg').getBoundingClientRect().toJSON(),
  }));
  expect(bounds.control.left).toBeGreaterThanOrEqual(bounds.card.left);
  expect(bounds.control.right).toBeLessThanOrEqual(bounds.card.right);
  expect(bounds.control.top).toBeGreaterThanOrEqual(bounds.card.top);
  expect(bounds.control.bottom).toBeLessThanOrEqual(bounds.card.bottom);
  expect(
    await control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        element.contains(
          document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        )
      );
    })
  ).toBe(true);
}
test('Progression controls fit narrow cards and support pointer and keyboard input', async ({
  page,
}) => {
  await page.goto(`${origin}/settings#progression`);
  const edition = page.locator('#settings-game-edition-input');
  await expect(edition).toContainText('Standard');
  for (const width of [320, 333, 390, 400, 1280]) {
    await page.setViewportSize({ width, height: 761 });
    await expectPointerTarget(edition);
    await edition.click();
    await page.getByRole('option', { name: 'Edge of Darkness + Unheard', exact: true }).click();
    const label = edition.locator('span.justify-self-start');
    await expect(label).toHaveText('Edge of Darkness + Unheard');
    expect(
      await label.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const button = element.closest('button').getBoundingClientRect();
        const chevron = element
          .closest('button')
          .querySelector('[data-slot="trailing"]')
          .getBoundingClientRect();
        return (
          element.scrollWidth <= element.clientWidth &&
          rect.right <= chevron.left &&
          chevron.right <= button.right &&
          button.right <= innerWidth
        );
      }),
      `edition label and chevron fit at ${width}px`
    ).toBe(true);
    await edition.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(edition).toContainText('Standard');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(edition).toBeFocused();
    const skills = page.locator('#skills');
    for (const name of ['In-Game', 'Priority']) {
      const button = skills.getByRole('button', { name, exact: true });
      await expectPointerTarget(button);
      await button.click();
      await expect(button).toHaveClass(/bg-primary-500/);
      await button.focus();
      await expect(button).toBeFocused();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(button).toBeFocused();
      await page.keyboard.press('Enter');
    }
  }
});
