'use strict';

/**
 * Fresh browser contexts intentionally receive the first-run product tour.
 * Close it through the same control a user would use before interacting with
 * the workspace beneath it.
 */
async function dismissOnboarding(page) {
  const overlay = page.locator('#onboarding-overlay');
  const visible = await overlay
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) return;

  await page.locator('#tour-skip-btn').click();
  await overlay.waitFor({ state: 'hidden', timeout: 5000 });

  // A separate first-visit kitchen coach can open 900 ms later and otherwise
  // cover the POS or settlement dialog. Decline it through its user-facing CTA.
  const notNow = page.getByRole('button', { name: 'Not now' });
  const coachVisible = await notNow
    .waitFor({ state: 'visible', timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  if (coachVisible) await notNow.click();
}

module.exports = { dismissOnboarding };