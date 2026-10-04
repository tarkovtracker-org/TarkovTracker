import { expect, test } from '@playwright/test';
import { protectPreviewBrowser } from './access.mjs';
const origin = new URL(process.env.PREVIEW_URL).origin;
const floorNames = ['3rd Floor', '2nd Floor', 'Ground Level', 'Garage'];
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
async function expectHitTarget(control) {
  await control.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(control).toBeVisible();
  await expect
    .poll(
      async () =>
        control.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            [0.1, 0.5, 0.9].every((fraction) =>
              element.contains(
                document.elementFromPoint(
                  rect.left + rect.width * fraction,
                  rect.top + rect.height / 2
                )
              )
            )
          );
        }),
      { message: (await control.getAttribute('aria-label')) || (await control.textContent()) }
    )
    .toBe(true);
}
function areSeparate(first, second) {
  return (
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}
async function checkToolbar(page, toolbar) {
  for (const control of await toolbar.getByRole('button').all()) {
    await expectHitTarget(control);
    const pressed = await control.getAttribute('aria-pressed');
    await control.click();
    if (pressed !== null) {
      await expect(control).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');
    } else {
      await expect(control).toHaveAttribute('data-state', 'open');
      await page.keyboard.press('Escape');
      await expect(control).toHaveAttribute('data-state', 'closed');
    }
  }
}
async function checkFloors(page, surface) {
  const toolbar = surface.getByTestId('map-toolbar');
  for (const name of floorNames) {
    const floor = surface.getByRole('button', { name, exact: true });
    await expectHitTarget(floor);
    const floorBox = await floor.boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    expect(areSeparate(floorBox, toolbarBox)).toBe(true);
    const layerState = () =>
      surface
        .locator('.leaflet-image-layer [data-layer]')
        .evaluateAll((layers) =>
          layers
            .map((layer) => `${layer.id}:${layer.style.display}:${layer.style.opacity}`)
            .join('|')
        );
    const previousLayers = await layerState();
    await floor.click();
    await expect(floor).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(layerState).not.toBe(previousLayers);
    await floor.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(floor).toBeFocused();
    expect(await floor.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(floor).toHaveAttribute('aria-pressed', 'true');
  }
  await checkToolbar(page, toolbar);
}
test('Ground Zero floors and toolbar remain operable in normal and fullscreen maps', async ({
  page,
}) => {
  await page.goto(`${origin}/tasks`);
  await page.getByRole('button', { name: 'Maps', exact: true }).click();
  const inline = page
    .locator('[tabindex="0"]')
    .filter({ has: page.locator('.leaflet-container') })
    .first();
  await expect(inline.locator('.leaflet-image-layer')).toBeVisible();
  await page
    .getByTestId('map-first-use-hint')
    .getByRole('button', { name: 'Got it', exact: true })
    .click();
  for (const [width, height] of [
    [320, 568],
    [333, 507],
    [390, 844],
    [400, 609],
    [1280, 761],
  ]) {
    await page.setViewportSize({ width, height });
    await checkFloors(page, inline);
    const fullscreenToggle = inline.getByTestId('map-fullscreen-toggle');
    await expectHitTarget(fullscreenToggle);
    await fullscreenToggle.click();
    const fullscreen = page.getByTestId('map-fullscreen-overlay');
    await expect(fullscreen.locator('.leaflet-image-layer')).toBeVisible();
    await checkFloors(page, fullscreen);
    await fullscreen.getByTestId('map-fullscreen-exit').click();
    await expect(fullscreen).toBeHidden();
  }
  await page.getByRole('button', { name: /^Woods(?:\s*\d+)?$/ }).click();
  await expect(inline.getByRole('button', { name: 'Garage', exact: true })).toHaveCount(0);
  await expect(inline.locator('.leaflet-image-layer')).toBeVisible();
  for (const [width, height] of [
    [333, 507],
    [400, 609],
    [1280, 761],
  ]) {
    await page.setViewportSize({ width, height });
    await checkToolbar(page, inline.getByTestId('map-toolbar'));
  }
});
