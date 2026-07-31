const path = require('node:path');
const { test, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..', '..');

test.describe('Kitchen tab visibility ownership', () => {
  test('permission refresh cannot reveal KDS in Billing-only mode', async ({ page }) => {
    await page.setContent(`
      <!doctype html>
      <html>
        <head></head>
        <body>
          <nav>
            <a class="sidebar-link" data-tab="kds-tab">Kitchen</a>
            <a class="mnav-link" data-tab="kds-tab">Kitchen</a>
          </nav>
          <button id="btn-kot">KOT</button>
        </body>
      </html>
    `);
    await page.evaluate(() => {
      window.RS_SETTINGS = {
        set_operating_mode: 'Billing only',
        set_pos_only_mode: true,
      };
    });
    await page.addScriptTag({ path: path.join(root, 'assets', 'modules', 'ops-mode.js') });
    await page.evaluate(() => window.RSOpsMode.applyUi());

    const kitchen = page.locator('.sidebar-link[data-tab="kds-tab"]');
    await expect(kitchen).toBeHidden();

    // Reproduce the permission poll that previously fought operating mode.
    await kitchen.evaluate((element) => {
      element.style.display = '';
    });
    await expect(kitchen).toBeHidden();

    await page.evaluate(() => {
      window.RS_SETTINGS.set_operating_mode = 'Full ops';
      window.RS_SETTINGS.set_pos_only_mode = false;
      window.RSOpsMode.applyUi();
    });
    await expect(kitchen).toBeVisible();
  });
});
