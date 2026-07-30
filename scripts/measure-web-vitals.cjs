'use strict';

const { chromium } = require('@playwright/test');

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickUrl() {
  const arg = process.argv.slice(2).find((x) => x && !x.startsWith('--'));
  return arg || process.env.PERF_URL || process.env.E2E_BASE_URL || process.env.BASE_URL || '';
}

async function main() {
  const url = pickUrl();
  if (!url) {
    process.stderr.write('Missing URL. Provide as arg or PERF_URL/E2E_BASE_URL/BASE_URL.\n');
    process.exit(2);
  }

  const maxLcp = num(process.env.MAX_LCP_MS, 3500);
  const maxFcp = num(process.env.MAX_FCP_MS, 2000);
  const maxTtfb = num(process.env.MAX_TTFB_MS, 800);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => {
    window.__rsVitals = { lcp: null, fcp: null, ttfb: null };
    const PerformanceObserver = globalThis.PerformanceObserver;
    try {
      const poLcp = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) {
          const v = last.renderTime || last.loadTime || last.startTime;
          window.__rsVitals.lcp = v;
        }
      });
      poLcp.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) {}

    try {
      const poPaint = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === 'first-contentful-paint') {
            window.__rsVitals.fcp = e.startTime;
          }
        }
      });
      poPaint.observe({ type: 'paint', buffered: true });
    } catch (_) {}

    try {
      const poNav = new PerformanceObserver((list) => {
        const nav = list.getEntries()[0];
        if (nav && typeof nav.responseStart === 'number') {
          window.__rsVitals.ttfb = nav.responseStart;
        }
      });
      poNav.observe({ type: 'navigation', buffered: true });
    } catch (_) {}
  });

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const vitals = await page.evaluate(() => {
    return window.__rsVitals || {};
  });

  await browser.close();

  const out = {
    url,
    lcp_ms: vitals.lcp == null ? null : Math.round(vitals.lcp),
    fcp_ms: vitals.fcp == null ? null : Math.round(vitals.fcp),
    ttfb_ms: vitals.ttfb == null ? null : Math.round(vitals.ttfb),
    wall_ms: Date.now() - startedAt,
  };

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');

  const fails = [];
  if (out.lcp_ms != null && out.lcp_ms > maxLcp) { fails.push(`LCP ${out.lcp_ms}ms > ${maxLcp}ms`); }
  if (out.fcp_ms != null && out.fcp_ms > maxFcp) { fails.push(`FCP ${out.fcp_ms}ms > ${maxFcp}ms`); }
  if (out.ttfb_ms != null && out.ttfb_ms > maxTtfb) { fails.push(`TTFB ${out.ttfb_ms}ms > ${maxTtfb}ms`); }

  if (fails.length) {
    process.stderr.write('Perf gate failed:\n' + fails.map((f) => ' - ' + f).join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write((e && e.stack) ? e.stack + '\n' : String(e) + '\n');
  process.exit(1);
});
