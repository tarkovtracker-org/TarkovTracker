import { expect, test } from '@playwright/test';
import { protectPreviewBrowser } from './access.mjs';
const origin = new URL(process.env.PREVIEW_URL).origin;
test.beforeEach(async ({ page, request }) => {
  await protectPreviewBrowser(page, request, origin);
});
async function expectPointerTarget(control) {
  await control.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(control).toBeVisible();
  await expect(async () => {
    const bounds = await control.evaluate((element) => ({
      control: element.getBoundingClientRect().toJSON(),
      card: element.closest('.overflow-hidden.rounded-lg').getBoundingClientRect().toJSON(),
    }));
    expect(bounds.control.left).toBeGreaterThanOrEqual(bounds.card.left);
    expect(bounds.control.right).toBeLessThanOrEqual(bounds.card.right);
    expect(bounds.control.top).toBeGreaterThanOrEqual(bounds.card.top);
    expect(bounds.control.bottom).toBeLessThanOrEqual(bounds.card.bottom);
  }).toPass({ timeout: 5000 });
  await expect
    .poll(async () => {
      await control.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      return control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          element.contains(
            document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          )
        );
      });
    })
    .toBe(true);
}
test('Progression controls fit narrow cards and support pointer and keyboard input', async ({
  page,
}) => {
  await page.goto(`${origin}/settings#progression`, { waitUntil: 'networkidle' });
  const edition = page.locator('#settings-game-edition-input');
  await expect(edition).toContainText('Standard');
  for (const [width, height] of [
    [320, 568],
    [333, 507],
    [390, 844],
    [400, 609],
    [1280, 761],
  ]) {
    const option = (name) => page.getByRole('option', { name, exact: true });
    await page.setViewportSize({ width, height });
    await expectPointerTarget(edition);
    await edition.click();
    await option('Edge of Darkness + Unheard').click();
    const label = edition.locator('span.justify-self-start');
    await expect(label).toHaveText('Edge of Darkness + Unheard');
    // The closing popup's focus trap returns focus to the trigger. Keys sent before that land on
    // the departing option instead, so wait for the popup to finish closing first.
    await expect(page.getByRole('listbox')).toBeHidden();
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
    await expect(edition).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(option('Edge of Darkness + Unheard')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Home');
    await expect(option('Standard')).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Enter');
    await expect(edition).toContainText('Standard');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(edition).toBeFocused();
    expect(await edition.evaluate((element) => getComputedStyle(element).boxShadow)).toMatch(
      /0px 0px 0px 4px/
    );
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
      expect(await button.evaluate((element) => getComputedStyle(element).boxShadow)).toMatch(
        /0px 0px 0px 4px/
      );
    }
  }
});
test('Recovery files parse in a worker and remain preview-only until confirmation', async ({
  page,
}) => {
  await page.goto(`${origin}/settings#backup-restore`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const parse = JSON.parse;
    JSON.parse = function (value, ...args) {
      if (typeof value === 'string' && value.length > 1024 * 1024)
        throw new Error('Large JSON parsed on UI thread');
      return parse.call(this, value, ...args);
    };
    File.prototype.text = () => {
      throw new Error('Backup file read on UI thread');
    };
    // Hold the first worker open request so cancellation/focus checks are deterministic.
    const NativeWorker = Worker;
    let holdOpen = true;
    window.Worker = class extends NativeWorker {
      postMessage(message, ...rest) {
        if (holdOpen && message.command.op === 'open') {
          holdOpen = false;
          return;
        }
        return super.postMessage(message, ...rest);
      }
    };
  });
  const mode = {
    level: 42,
    pmcFaction: 'USEC',
    taskCompletions: {},
    taskObjectives: {},
    hideoutParts: {},
    hideoutModules: {},
    traders: {},
    skills: {},
    prestigeLevel: 0,
    skillOffsets: {},
    storyChapters: {},
  };
  const raw =
    JSON.stringify({
      _userId: null,
      data: { currentGameMode: 'pvp', gameEdition: 1, tarkovUid: null, pvp: mode, pve: mode },
    }) + ' '.repeat(6 * 1024 * 1024);
  const archive = Buffer.from(
    JSON.stringify({ _format: 'tarkovtracker-device-progress', _version: 1, current: raw })
  );
  const input = page.locator('#backup-restore input[type="file"]');
  const panel = page.getByRole('tabpanel', { name: 'Backup & Restore' });
  const reading = panel.getByTestId('backup-reading-status');
  await expect(reading).toBeAttached();
  const upload = { name: 'recovery.json', mimeType: 'application/json', buffer: archive };
  await input.setInputFiles(upload);
  await expect(reading).toHaveText('Reading backup…');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Import TarkovTracker Backup', exact: true })
  ).toBeFocused();
  await expect(reading).toBeEmpty();
  await input.setInputFiles(upload);
  await expect(panel.getByRole('button', { name: 'Confirm Import', exact: true })).toBeVisible();
  await expect(panel).toContainText('42 (USEC)');
  await expect(
    page.getByRole('button', { name: 'Level 1, click or press Enter to edit' })
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Confirm Import', exact: true })).toBeHidden();
  await input.setInputFiles({
    name: 'ordinary.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ padding: ' '.repeat(6 * 1024 * 1024) })),
  });
  await expect(panel).toContainText('Backup file is too large (max 5 MB)');
});
