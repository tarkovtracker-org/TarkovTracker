import { expect, test } from '@playwright/test';
import { protectPreviewBrowser } from './access.mjs';
import { previewOrigin } from './readiness.mjs';
const origin = previewOrigin();
// Public pages that scrolled sideways or hid content under the nav rail at phone widths (#1048).
const routes = [
  '/supporter',
  '/about',
  '/resources',
  '/resources/tarkovtracker_org_vs_io',
  '/resources/tarkovdev',
  '/resources/ratscanner',
  '/resources/tarkovmonitor',
  '/resources/cultistcircle',
];
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
/** Widest sideways overflow of the main content scroller (the document itself never scrolls). */
const mainOverflow = (page) =>
  page
    .locator('#main-content')
    .evaluate((main) =>
      Math.max(...[main, main.firstElementChild].map((node) => node.scrollWidth - node.clientWidth))
    );
/** The page wrapper's content box: the column inside its horizontal padding. */
const contentColumn = (page) =>
  page.locator('#main-content > div > div').evaluate((wrapper) => {
    const box = wrapper.getBoundingClientRect();
    const style = getComputedStyle(wrapper);
    return {
      left: box.left + parseFloat(style.paddingLeft),
      right: box.right - parseFloat(style.paddingRight),
    };
  });
/** Every text node's line boxes, read in the page. */
const textLines = (page) =>
  page.locator('#main-content').evaluate((main) => {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return {
        text: node.textContent.trim().slice(0, 40),
        hidden: Boolean(node.parentElement.closest('[aria-hidden="true"], .sr-only')),
        boxes: [...range.getClientRects()].map((box) => ({ left: box.left, right: box.right })),
      };
    });
  });
const outside = (column) => (box) =>
  box.right > box.left && (box.left < column.left - 0.5 || box.right > column.right + 0.5);
/** Visible text lines that extend past the content column, so clipping cannot mask overflow. */
const textOutsideColumn = async (page) => {
  const column = await contentColumn(page);
  const visible = (await textLines(page)).filter((line) => line.text && !line.hidden);
  return visible.filter((line) => line.boxes.some(outside(column))).map((line) => line.text);
};
for (const width of [320, 360]) {
  test.describe(`${width}px public pages`, () => {
    test.use({ viewport: { width, height: 800 } });
    for (const route of routes) {
      test(`${route} fits without sideways scrolling`, async ({ page }) => {
        await page.goto(`${origin}${route}`);
        await expect(page.locator('main h1').first()).toBeVisible();
        await page.waitForLoadState('networkidle');
        expect(await mainOverflow(page), `${route} sideways overflow in px`).toBe(0);
        expect(await textOutsideColumn(page), `${route} text outside the column`).toEqual([]);
      });
    }
    test('every billing option and badge stays in the column beside the rail and is operable', async ({
      page,
    }) => {
      await page.goto(`${origin}/supporter`);
      const options = page.locator('#tiers button[aria-pressed]');
      await expect(options).toHaveCount(3);
      const column = await contentColumn(page);
      for (const option of await options.all()) {
        const boxes = await option.evaluate((node) =>
          [node, ...node.querySelectorAll('span')].map((part) =>
            part.getBoundingClientRect().toJSON()
          )
        );
        expect(boxes.filter(outside(column)), 'option or badge outside the column').toEqual([]);
        expect(await option.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        await option.click();
        await expect(option).toHaveAttribute('aria-pressed', 'true');
      }
    });
  });
}
