'use strict';
const fs = require('fs');
let s = fs.readFileSync('scripts/generate-onboarding-guide.cjs', 'utf8');

s = s.replace(/docs[\\/']onboarding-guide(?!-mobile)/g, (m) =>
  m.includes("'") ? "'onboarding-guide-mobile'" : m.replace('onboarding-guide', 'onboarding-guide-mobile')
);
s = s.replace(/'onboarding-guide'/g, "'onboarding-guide-mobile'");
s = s.replace(/RestroSuite-Complete-Onboarding-Guide/g, 'RestroSuite-Mobile-Onboarding-Guide');
s = s.replace(/Desktop \/ Web/g, 'Mobile / Android');
s = s.replace(/\(Desktop \/ Web\)/g, '(Mobile / Android)');
s = s.replace(/width: 1600, height: 1000/g, 'width: 390, height: 844');
s = s.replace(/setViewportSize\(\{ width: 1600, height: 1000 \}\)/g, 'setViewportSize({ width: 390, height: 844 })');
s = s.replace(/Chrome\/120 Safari\/537\.36/g, 'Chrome/120.0.0.0 Mobile Safari/537.36');
s = s.replace(/size: A4 landscape/g, 'size: A4 portrait');
s = s.replace(/width: 297mm;/g, 'width: 210mm;');
s = s.replace(/height: 210mm;/g, 'height: 297mm;');
s = s.replace(/landscape: true/g, 'landscape: false');
s = s.replace(/height: 148mm;/g, 'height: 175mm;');
s = s.replace(
  'const context = await browser.newContext({',
  'const context = await browser.newContext({\n      isMobile: true,\n      hasTouch: true,'
);
s = s.replace(
  'From Google search<br>to your first full day<br>on the counter.',
  'Phone &amp; Android guide<br>Bottom tabs · hamburger · More<br>Touch-first full walkthrough.'
);

const openFn = `async function openDashboardTab(page, tabId, settingsPanel) {
  if (tabId === 'settings-tab') {
    const ham = page.locator('#sidebarToggle, .sidebar-hamburger').first();
    if (await ham.isVisible({ timeout: 800 }).catch(() => false)) await ham.click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('#open-settings').click({ timeout: 8000 }).catch(async () => {
      await page.evaluate(() => {
        if (window.RS && RS.activateTab) RS.activateTab('settings-tab');
      });
    });
    await page.waitForTimeout(1000);
    if (settingsPanel) {
      const btn = page.locator('.set-nav button[data-s="' + settingsPanel + '"]').first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(700);
      }
    }
    return;
  }
  // Bottom mobile nav
  const mlink = page.locator('.mnav-link[data-tab="' + tabId + '"]').first();
  if (await mlink.count() && (await mlink.isVisible().catch(() => false))) {
    await mlink.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return;
  }
  // Modules not on bottom bar → More or hamburger sidebar
  const more = page.locator('#mnav-more').first();
  if (await more.isVisible().catch(() => false)) {
    await more.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const ham2 = page.locator('#sidebarToggle, .sidebar-hamburger').first();
  if (await ham2.isVisible().catch(() => false)) {
    await ham2.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const link = page.locator('.sidebar-link[data-tab="' + tabId + '"]').first();
  if (await link.count() && (await link.isVisible().catch(() => false))) {
    await link.click({ timeout: 6000 }).catch(() => {});
  } else {
    await page.evaluate((id) => {
      if (window.RS && typeof RS.activateTab === 'function') RS.activateTab(id);
      else if (window.RS && typeof RS.switchTab === 'function') RS.switchTab(id);
    }, tabId);
  }
  await page.waitForTimeout(1400);
}`;

s = s.replace(/async function openDashboardTab\(page, tabId, settingsPanel\) \{[\s\S]*?await page\.waitForTimeout\(1400\);\n\}/, openFn);

// Mobile-specific first steps for install
s = s.replace(
  "title: 'Search for CodeArc RestroSuite on Google',",
  "title: 'Find RestroSuite (search or APK / browser)',"
);
s = s.replace(
  "goal: 'A new owner finds the product online without a salesperson.',",
  "goal: 'Find the product on phone browser or install the Android app.',"
);

fs.writeFileSync('scripts/generate-onboarding-guide-mobile.cjs', s);
try {
  require('child_process').execSync('node --check scripts/generate-onboarding-guide-mobile.cjs', {
    stdio: 'inherit',
  });
  console.log('OK mobile script');
} catch (e) {
  console.error('syntax fail');
  process.exit(1);
}
