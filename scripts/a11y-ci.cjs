'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');
const axe = require('axe-core');

function parseCsv(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function impactRank(impact) {
  const m = { minor: 1, moderate: 2, serious: 3, critical: 4 };
  return m[String(impact || '').toLowerCase()] || 0;
}

function defaultUrls() {
  const root = path.resolve(__dirname, '..', 'publish-static');
  const files = ['index.html?home=1', 'login.html', 'qr-order.html'];
  return files.map((f) => {
    const [file, q] = f.split('?');
    const u = pathToFileURL(path.join(root, file)).toString();
    return q ? (u + '?' + q) : u;
  });
}

async function settlePage(page) {
  for (let i = 0; i < 3; i++) {
    const before = page.url();
    await page.waitForLoadState('load', { timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(250);
    const after = page.url();
    if (after === before) {
      return after;
    }
  }
  return page.url();
}

async function scanPage(browser, url, minImpactRank) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const finalUrl = await settlePage(page);

    // file:// → login redirect can land on chrome-error:// when login.html
    // is missing from the same folder; treat that as a hard gate failure.
    if (/^chrome-error:\/\//i.test(String(finalUrl || ''))) {
      return {
        url,
        finalUrl,
        violations: [{
          id: 'page-load-failed',
          impact: 'critical',
          help: 'Page failed to load (chrome-error). Check redirects and publish-static output.',
          nodes: [{ target: ['html'] }],
        }],
      };
    }

    await page.addScriptTag({ content: axe.source });

    const results = await page.evaluate(async () => {
      return window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
        resultTypes: ['violations'],
      });
    });

    const violations = (results && results.violations) ? results.violations : [];
    const bad = violations.filter((v) => impactRank(v.impact) >= minImpactRank);
    return { url, finalUrl, violations: bad };
  } finally {
    await page.close();
  }
}

async function main() {
  const urls = parseCsv(process.env.A11Y_URLS);
  const targets = urls.length ? urls : defaultUrls();

  const minImpact = process.env.A11Y_MIN_IMPACT || 'serious';
  const minImpactRank = impactRank(minImpact);
  if (!minImpactRank) {
    process.stderr.write(`Invalid A11Y_MIN_IMPACT="${minImpact}". Use minor|moderate|serious|critical.\n`);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const all = [];
    for (const url of targets) {
      const r = await scanPage(browser, url, minImpactRank);
      all.push(r);
    }

    const failing = all.filter((x) => x.violations.length);
    for (const page of failing) {
      const u = page.finalUrl && page.finalUrl !== page.url ? `${page.url} → ${page.finalUrl}` : page.url;
      process.stdout.write(`A11Y violations (${minImpact}+): ${u}\n`);
      for (const v of page.violations) {
        const nodes = Array.isArray(v.nodes) ? v.nodes : [];
        const sample = nodes[0] && nodes[0].target ? nodes[0].target.join(', ') : '';
        process.stdout.write(`- ${v.id} [${v.impact}] ${v.help} (${nodes.length} nodes) ${sample}\n`);
      }
      process.stdout.write('\n');
    }

    if (failing.length) {
      process.stderr.write(`A11Y gate failed: ${failing.length}/${all.length} pages have ${minImpact}+ violations.\n`);
      process.exit(1);
    }

    process.stdout.write(`A11Y gate passed: ${all.length} pages scanned (minImpact=${minImpact}).\n`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  process.stderr.write((e && e.stack) ? e.stack + '\n' : String(e) + '\n');
  process.exit(1);
});
