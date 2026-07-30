'use strict';

const { chromium } = require('@playwright/test');

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickUrls() {
  const args = process.argv.slice(2).filter((x) => x && !x.startsWith('--'));
  if (args.length) {return args;}
  const single = process.env.PERF_URL || process.env.E2E_BASE_URL || process.env.BASE_URL || '';
  if (!single) {return [];}
  return String(single).split(',').map((s) => s.trim()).filter(Boolean);
}

async function measureOne(browser, url) {
  const isRemote = /^https?:\/\//i.test(url);
  const maxLcp = num(process.env.MAX_LCP_MS, isRemote ? 4500 : 3500);
  const maxFcp = num(process.env.MAX_FCP_MS, isRemote ? 3500 : 2000);
  const maxTtfb = num(process.env.MAX_TTFB_MS, isRemote ? 1500 : 800);
  const maxCls = num(process.env.MAX_CLS, isRemote ? 0.25 : 0.1);

  const page = await browser.newPage();

  await page.addInitScript(() => {
    window.__rsVitals = { lcp: null, fcp: null, ttfb: null, cls: 0 };
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

    try {
      let cls = 0;
      const poCls = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) {cls += e.value;}
        }
        window.__rsVitals.cls = cls;
      });
      poCls.observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}
  });

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const vitals = await page.evaluate(() => window.__rsVitals || {});
  await page.close();

  const out = {
    url,
    lcp_ms: vitals.lcp == null ? null : Math.round(vitals.lcp),
    fcp_ms: vitals.fcp == null ? null : Math.round(vitals.fcp),
    ttfb_ms: vitals.ttfb == null ? null : Math.round(vitals.ttfb),
    cls: vitals.cls == null ? null : Math.round(Number(vitals.cls) * 1000) / 1000,
    wall_ms: Date.now() - startedAt,
  };

  const fails = [];
  if (out.lcp_ms != null && out.lcp_ms > maxLcp) {fails.push(`LCP ${out.lcp_ms}ms > ${maxLcp}ms`);}
  if (out.fcp_ms != null && out.fcp_ms > maxFcp) {fails.push(`FCP ${out.fcp_ms}ms > ${maxFcp}ms`);}
  if (out.ttfb_ms != null && out.ttfb_ms > maxTtfb) {fails.push(`TTFB ${out.ttfb_ms}ms > ${maxTtfb}ms`);}
  if (out.cls != null && out.cls > maxCls) {fails.push(`CLS ${out.cls} > ${maxCls}`);}

  return { out, fails };
}

async function main() {
  const urls = pickUrls();
  if (!urls.length) {
    process.stderr.write('Missing URL. Provide as arg(s) or PERF_URL/E2E_BASE_URL/BASE_URL.\n');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];
  const allFails = [];

  try {
    for (const url of urls) {
      const { out, fails } = await measureOne(browser, url);
      results.push(out);
      for (const f of fails) {allFails.push(`${url}: ${f}`);}
    }
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(results.length === 1 ? results[0] : results, null, 2) + '\n');

  if (allFails.length) {
    process.stderr.write('Perf gate failed:\n' + allFails.map((f) => ' - ' + f).join('\n') + '\n');
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write((e && e.stack) ? e.stack + '\n' : String(e) + '\n');
  process.exit(1);
});
