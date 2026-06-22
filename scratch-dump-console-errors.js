const puppeteer = require('puppeteer');

(async () => {
  console.log('=== LOADING DASHBOARD TO DUMP ERRORS ===');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Stub session variables and window.fetch before navigation
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('tenant_session_token', 'mock-session-token');
    sessionStorage.setItem('logged_in_user', 'testcashier');
    sessionStorage.setItem('logged_in_role', 'admin');
    sessionStorage.setItem('tenant_id', 'test-tenant');
    sessionStorage.setItem('tenant_slug', 'test');
    sessionStorage.setItem('tenant_name', 'Doppio Cafe');
    sessionStorage.setItem('allowed_tabs', JSON.stringify(['pos-tab']));

    window.confirm = () => true;
    window.alert = () => {};
    window.prompt = () => null;

    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      const urlStr = String(url);
      if (urlStr.includes('tenant-access')) {
        const body = JSON.parse(options?.body || '{}');
        if (body.action === 'validate_session') {
          return new Response(JSON.stringify({
            session: {
              session_token: 'mock-session-token',
              tenant_id: 'test-tenant',
              tenant_slug: 'test',
              tenant_name: 'Doppio Cafe',
              username: 'testcashier',
              role: 'admin',
              display_name: 'Test Cashier',
              allowed_tabs: ['pos-tab']
            }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
      }
      if (urlStr.includes('tenant-data')) {
        const body = JSON.parse(options?.body || '{}');
        if (body.operation === 'select') {
          return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ data: body.data || {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      try {
        return await originalFetch(url, options);
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
      }
    };
  });

  page.on('pageerror', err => {
    console.error('PAGE ERROR EXCEPTION:', err.message, err.stack);
  });
  
  page.on('console', msg => {
    console.log(`CONSOLE [${msg.type()}]:`, msg.text());
  });

  await page.goto('http://localhost:8001/dashboard.html', { waitUntil: 'load', timeout: 10000 });
  await new Promise(r => setTimeout(r, 3000));
  console.log('Final URL:', page.url());
  await browser.close();
  console.log('=== DONE ===');
})().catch(err => {
  console.error(err);
});
