/**
 * Playwright prep helpers so each onboarding step shows the right UI state.
 */
'use strict';

async function openInvTab(page, invTab) {
  if (!invTab) return;
  const btn = page.locator('[data-inv-tab="' + invTab + '"]').first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(800);
  }
}

async function openEmpSeg(page, empSeg) {
  if (!empSeg) return;
  // Segment buttons inside employees tab
  const exact = page.locator('#employees-tab .seg button, #employees-tab button').filter({ hasText: empSeg }).first();
  if (await exact.isVisible({ timeout: 2500 }).catch(() => false)) {
    await exact.click().catch(() => {});
    await page.waitForTimeout(700);
    return;
  }
  await page
    .evaluate((label) => {
      const root = document.getElementById('employees-tab') || document;
      const btns = [...root.querySelectorAll('button, .seg button')];
      const b = btns.find((x) => (x.textContent || '').trim() === label);
      if (b) b.click();
    }, empSeg)
    .catch(() => {});
  await page.waitForTimeout(700);
}

async function openGrowthTile(page, title) {
  if (!title) return;
  // Ensure hub grid rendered
  await page.waitForTimeout(500);
  const card = page.locator('#hub-grid .hub-card, .hub-card').filter({ hasText: title }).first();
  if (await card.isVisible({ timeout: 4000 }).catch(() => false)) {
    await card.click().catch(() => {});
    await page.waitForTimeout(1000);
    return;
  }
  await page
    .evaluate((t) => {
      const cards = [...document.querySelectorAll('#hub-grid .hub-card, .hub-card')];
      const c = cards.find((el) => (el.textContent || '').includes(t));
      if (c) c.click();
    }, title)
    .catch(() => {});
  await page.waitForTimeout(1000);
}

async function runPrep(page, prep) {
  if (!prep) return;
  try {
    if (prep === 'scrollMarketingFeatures') {
      await page.evaluate(() => {
        const el =
          document.querySelector('#features, .features, [id*="feature"]') ||
          document.querySelector('a[href*="feature"]');
        if (el) el.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, Math.min(900, document.body.scrollHeight));
      });
      await page.waitForTimeout(600);
      return;
    }

    if (prep === 'openRecover') {
      const link = page
        .locator(
          'a:has-text("Forgot"), a:has-text("Recover"), button:has-text("Forgot"), button:has-text("Recover"), #tab-recover, [data-tab="recover"]'
        )
        .first();
      if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
        await link.click().catch(() => {});
        await page.waitForTimeout(700);
      }
      return;
    }

    if (prep === 'openMoreSheet') {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      const more = page.locator('#mnav-more').first();
      if (await more.isVisible({ timeout: 2000 }).catch(() => false)) {
        await more.click();
        await page.waitForTimeout(900);
        await page
          .waitForSelector('.hub-card[data-go], .dash-modal.active, [class*="modal"].active', {
            timeout: 5000,
          })
          .catch(() => {});
      }
      return;
    }

    if (prep === 'showOrderTypes') {
      await page.locator('#pos-cart-order-types, .order-type-btn').first().scrollIntoViewIfNeeded().catch(() => {});
      const dine = page.locator('.order-type-btn[title="Dine-in"], .order-type-btn[aria-label="Dine-in"]').first();
      if (await dine.isVisible({ timeout: 1500 }).catch(() => false)) {
        await dine.click().catch(() => {});
        await page.waitForTimeout(400);
      }
      return;
    }

    if (prep === 'openCustomerOnCart') {
      const toggle = page.locator('#cart-cust-toggle').first();
      if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
        await toggle.click().catch(() => {});
        await page.waitForTimeout(500);
      }
      return;
    }

    if (prep === 'openCartMoreOpts') {
      await page
        .evaluate(() => {
          const d = document.querySelector('#cart-more-opts');
          if (d) d.open = true;
        })
        .catch(() => {});
      await page.locator('#cart-more-opts, #promo-input, #cart-tip-row').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      return;
    }

    if (prep === 'highlightHoldKot') {
      await page.locator('#btn-hold-current, #btn-kot, #btn-m-hold-current').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
      return;
    }

    if (prep === 'openCheckout') {
      const checkoutBar = page
        .locator('#mobile-cart-bar, .mobile-cart-bar, button:has-text("CHECKOUT"), [class*="mobile-cart"]')
        .first();
      if (await checkoutBar.isVisible({ timeout: 1200 }).catch(() => false)) {
        await checkoutBar.click().catch(() => {});
        await page.waitForTimeout(800);
      }
      await page.locator('#btn-checkout, #cart-payment, .cart-payment').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(400);
      return;
    }

    if (prep === 'openSplitPay') {
      // open checkout area then click Split
      const checkoutBar = page.locator('button:has-text("CHECKOUT"), #mobile-cart-bar').first();
      if (await checkoutBar.isVisible({ timeout: 800 }).catch(() => false)) {
        await checkoutBar.click().catch(() => {});
        await page.waitForTimeout(600);
      }
      const split = page.locator('[data-pay-method="Split"]').first();
      if (await split.isVisible({ timeout: 2000 }).catch(() => false)) {
        await split.click().catch(() => {});
        await page.waitForTimeout(600);
      }
      await page.locator('#cart-tender-host, [data-pay-method="Split"]').first().scrollIntoViewIfNeeded().catch(() => {});
      return;
    }

    if (prep === 'openShiftUi') {
      const btn = page.locator('#rs-shift-open, #rs-shift-close').first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(800);
      } else {
        await page.locator('#rs-pos-more-toggle').first().click().catch(() => {});
        await page.waitForTimeout(300);
        await page.locator('#rs-shift-open, #rs-shift-close').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(600);
      }
      return;
    }

    if (prep === 'openFloorQrPrint') {
      const printBtn = page
        .locator('#btn-print-floor-qrs, button:has-text("Print Table"), button:has-text("Print QR")')
        .first();
      if (await printBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await printBtn.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
      return;
    }

    if (prep === 'openEditTables') {
      const btn = page.locator('#btn-edit-tables, button:has-text("Edit Tables"), button:has-text("Edit tables")').first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(900);
      }
      return;
    }

    if (prep === 'highlightFloorQrBulk') {
      await page.locator('#btn-open-all-qr, #btn-close-all-qr').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
      return;
    }

    if (prep === 'openKitchenSetup') {
      const btn = page
        .locator('#klc-sidebar-setup, #klc-mobile-setup, [data-klc-nav="setup"], button:has-text("Kitchen Setup")')
        .first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(1000);
      } else {
        // try sidebar kitchen setup link
        await page.locator('a:has-text("Kitchen Setup"), .sidebar-link:has-text("Kitchen")').first().click().catch(() => {});
        await page.waitForTimeout(800);
      }
      return;
    }

    if (prep === 'highlightBillsExport') {
      await page
        .locator('#btn-export-bills, #btn-export-bills-csv, #btn-print-day-report')
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await page.waitForTimeout(300);
      return;
    }

    if (prep === 'highlightMenuIo') {
      await page
        .locator('#btn-export-menu, #btn-import-menu, #btn-enable-all-menu')
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await page.waitForTimeout(300);
      return;
    }

    if (prep === 'highlightReportsExport') {
      await page.locator('#reports-tab button, #btn-download-gstr').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
      return;
    }

    if (prep === 'openFirstCustomer') {
      const card = page.locator('#customers-tab .cust-card, #customers-tab tr, #customers-tab .card, #customers-tab [data-id]').first();
      if (await card.isVisible({ timeout: 2000 }).catch(() => false)) {
        await card.click().catch(() => {});
        await page.waitForTimeout(800);
      }
      return;
    }

    if (prep === 'openHelp') {
      const help = page
        .locator('#open-help, button:has-text("Help"), .sb-foot-btn:has-text("Help"), a:has-text("Help")')
        .first();
      if (await help.isVisible({ timeout: 2000 }).catch(() => false)) {
        await help.click().catch(() => {});
        await page.waitForTimeout(900);
      }
      return;
    }
  } catch (e) {
    process.stdout.write('(prep ' + prep + ' warn) ');
  }
}

/** After tab open: settings panel, inv sub-tab, emp segment, growth tile, then prep */
async function applyStepUi(page, s) {
  if (s.invTab) await openInvTab(page, s.invTab);
  if (s.empSeg) await openEmpSeg(page, s.empSeg);
  if (s.growthTile) await openGrowthTile(page, s.growthTile);
  if (s.prep) await runPrep(page, s.prep);
}

module.exports = { runPrep, applyStepUi, openInvTab, openEmpSeg, openGrowthTile };
