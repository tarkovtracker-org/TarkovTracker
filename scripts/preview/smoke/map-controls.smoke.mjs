import { expect, test } from '@playwright/test';
import { protectPreviewBrowser } from './access.mjs';
const origin = new URL(process.env.PREVIEW_URL).origin;
const floorNames = ['3rd Floor', '2nd Floor', 'Ground Level', 'Garage'];
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
async function expectHitTarget(control) {
  await expect(control).toBeVisible();
  await expect
    .poll(
      async () => {
        // Late layout shifts (map tiles, task cards) can move the control under the fixed app bar
        // after a single scroll, so re-center before every hit-test sample.
        await control.evaluate((element) => element.scrollIntoView({ block: 'center' }));
        return control.evaluate((element) => {
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
        });
      },
      { message: (await control.getAttribute('aria-label')) || (await control.textContent()) }
    )
    .toBe(true);
}
test('Transit locations toggle independently in inline and fullscreen maps', async ({ page }) => {
  await page.goto(`${origin}/tasks/maps`);
  const inline = page
    .locator('[tabindex="0"]')
    .filter({ has: page.locator('.leaflet-container') })
    .first();
  await expect(inline.locator('.leaflet-image-layer')).toBeVisible();
  await page.getByTestId('map-hint-dismiss').click();
  const assertTransits = async (surface) => {
    // Layer toggles live in the Layers panel when the map has one, otherwise in the toolbar.
    const layersToggle = surface.getByTestId('map-layers-toggle');
    if ((await layersToggle.count()) > 0) {
      if ((await layersToggle.getAttribute('aria-expanded')) !== 'true') await layersToggle.click();
      await expect(layersToggle).toHaveAttribute('aria-expanded', 'true');
    }
    const toggle = surface.getByRole('button', { name: 'Transit', exact: true });
    const markers = surface.locator('.transit-marker');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(markers).not.toHaveCount(0);
    const count = await markers.count();
    const extracts = surface.getByRole('button', { name: 'PMC', exact: true });
    if ((await extracts.getAttribute('aria-pressed')) !== 'true') await extracts.click();
    await expectHitTarget(toggle);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(markers).toHaveCount(0);
    await expect(extracts).toHaveAttribute('aria-pressed', 'true');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(markers).toHaveCount(count);
  };
  await assertTransits(inline);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertTransits(inline);
  await inline.getByTestId('map-fullscreen-toggle').click();
  const fullscreen = page.getByTestId('map-fullscreen-overlay');
  await expect(fullscreen.locator('.leaflet-image-layer')).toBeVisible();
  await assertTransits(fullscreen);
  await fullscreen.getByTestId('map-fullscreen-exit').click();
  await page.getByRole('button', { name: /^Customs(?:\s*\d+)?$/ }).click();
  await expect(
    inline.locator('.transit-marker').filter({ hasText: 'Transit to Reserve' })
  ).toHaveCount(1);
  await expect(
    inline.locator('.transit-marker').filter({ hasText: 'Transit to Streets of Tarkov' })
  ).toHaveCount(0);
});
function areSeparate(first, second) {
  return (
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}
const flip = (value) => (value === 'true' ? 'false' : 'true');
async function checkPopover(page, control) {
  await expect(control).toHaveAttribute('data-state', 'open');
  await page.keyboard.press('Escape');
  await expect(control).toHaveAttribute('data-state', 'closed');
}
// The Layers disclosure toggles in place; restore it so later controls keep their layout.
async function checkDisclosure(control, expanded) {
  await expect(control).toHaveAttribute('aria-expanded', flip(expanded));
  await control.click();
  await expect(control).toHaveAttribute('aria-expanded', expanded);
}
async function checkToolbarControl(page, control) {
  await expectHitTarget(control);
  const pressed = await control.getAttribute('aria-pressed');
  const expanded = await control.getAttribute('aria-expanded');
  const isLayersToggle = (await control.getAttribute('data-testid')) === 'map-layers-toggle';
  await control.click();
  if (pressed !== null) return expect(control).toHaveAttribute('aria-pressed', flip(pressed));
  if (isLayersToggle) return checkDisclosure(control, expanded);
  return checkPopover(page, control);
}
// Layer rows inside the Layers panel must be reachable and flip, then restore their state.
async function checkLayerRows(surface) {
  const layersToggle = surface.getByTestId('map-layers-toggle');
  if ((await layersToggle.count()) === 0) return;
  const expanded = await layersToggle.getAttribute('aria-expanded');
  if (expanded !== 'true') await layersToggle.click();
  const rows = surface.getByTestId('map-layers-panel').locator('button[aria-pressed]');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expectHitTarget(row);
    const pressed = await row.getAttribute('aria-pressed');
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', flip(pressed));
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', pressed);
  }
  // Leave the disclosure as found so later viewports keep their original layout.
  if (expanded !== 'true') await layersToggle.click();
  await expect(layersToggle).toHaveAttribute('aria-expanded', expanded);
}
async function checkToolbar(page, toolbar) {
  for (const control of await toolbar.getByRole('button').all()) {
    await checkToolbarControl(page, control);
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
    // Keep the keyboard target distinct from this and the next pointer selection.
    const keyboardName = floorNames[(floorNames.indexOf(name) + 2) % floorNames.length];
    const keyboardFloor = surface.getByRole('button', { name: keyboardName, exact: true });
    await expect(keyboardFloor).toHaveAttribute('aria-pressed', 'false');
    const pointerSelectedLayers = await layerState();
    await keyboardFloor.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(keyboardFloor).toBeFocused();
    expect(await keyboardFloor.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
      'none'
    );
    await page.keyboard.press('Enter');
    await expect(keyboardFloor).toHaveAttribute('aria-pressed', 'true');
    await expect(floor).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(layerState).not.toBe(pointerSelectedLayers);
  }
  await checkToolbar(page, toolbar);
}
test('Ground Zero floors and toolbar remain operable in normal and fullscreen maps', async ({
  page,
}) => {
  await page.goto(`${origin}/tasks/maps`);
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
    await checkLayerRows(inline);
  }
});
