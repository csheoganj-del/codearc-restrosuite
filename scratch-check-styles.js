const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Capture console logs
    page.on('console', msg => {
      console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    // Capture page errors
    page.on('pageerror', err => {
      console.log(`[Browser Error]: ${err.toString()}`);
    });

    console.log('Injecting session stubs...');
    await page.evaluateOnNewDocument(() => {
      sessionStorage.setItem('tenant_session_token', 'eyJyb2xlIjoiYWRtaW4iLCJ1c2VybmFtZSI6ImRvcHBpb2NsIiwidGVuYW50X2lkIjoiYTNhMjk4ODYtZWI1Zi00OTJlLWEzYjYtMmFhZDIxNTcyMmIwIiwidGVuYW50X3NsdWciOiJkb3BwaW9jbCIsImxlZ2FjeV9vd25lciI6dHJ1ZSwiYXV0aF92ZXJzaW9uIjoxLCJleHAiOjE3ODIxMzcyMDk0MjJ9.uaz_Anr7MVF3aYjJ3-cng9gavSPmOK-cL-Wh2SHTQKA');
      sessionStorage.setItem('tenant_role', 'admin');
      sessionStorage.setItem('tenant_display_name', 'Doppiocl');
      sessionStorage.setItem('tenant_id', 'a3a29886-eb5f-492e-a3b6-2aad215722b0');
      sessionStorage.setItem('tenant_slug', 'doppiocl');
      sessionStorage.setItem('tenant_name', 'Doppio Cafe');
      sessionStorage.setItem('tenant_allowed_tabs', JSON.stringify(['pos-tab','bills-tab','inventory-tab','reports-tab','editor-tab','crm-tab','tax-tab']));
    });

    console.log('Navigating to local site (WITHOUT appv parameter)...');
    await page.goto('http://localhost:8001/dashboard.html#pos-tab', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('Waiting for elements to render...');
    await new Promise(r => setTimeout(r, 6000));

    console.log('\n--- DIAGNOSTICS ---');
    const result = await page.evaluate(() => {
      const getStyles = (id) => {
        const el = document.getElementById(id);
        if (!el) return { error: `Element #${id} not found` };
        const comp = window.getComputedStyle(el);
        return {
          id: el.id,
          tagName: el.tagName,
          className: el.className,
          display: comp.display,
          position: comp.position,
          bottom: comp.bottom,
          width: comp.width,
          height: comp.height,
          opacity: comp.opacity,
          visibility: comp.visibility,
          zIndex: comp.zIndex,
          offsetTop: el.offsetTop,
          parentTagName: el.parentElement ? el.parentElement.tagName : 'NONE'
        };
      };

      // Collect links
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);

      return {
        cashDrawer: getStyles('cash-drawer'),
        splitDrawer: getStyles('split-drawer'),
        links: links,
        bodyChildren: Array.from(document.body.children).slice(0, 8).map(c => ({ id: c.id, className: c.className, tagName: c.tagName }))
      };
    });

    console.log('Cash Drawer Styles:', JSON.stringify(result.cashDrawer, null, 2));
    console.log('Split Drawer Styles:', JSON.stringify(result.splitDrawer, null, 2));
    console.log('Loaded Stylesheets:', result.links);
    console.log('First body children:', result.bodyChildren);

    console.log('\nTaking diagnostic screenshot...');
    const outputPath = path.join('C:', 'Users', 'MASTER PC', '.gemini', 'antigravity', 'brain', '25acef71-566f-472a-a4e8-1e0c6ec04c6b', 'media__diagnostic_screenshot_no_appv.png');
    await page.screenshot({ path: outputPath, fullPage: false });
    console.log(`Saved screenshot to: ${outputPath}`);

    await browser.close();
  } catch (err) {
    console.error('Error during diagnostics:', err);
  }
})();
