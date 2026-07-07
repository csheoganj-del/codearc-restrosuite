// Harness: runs the REAL tenant-public edge function code (transpiled from TS)
// behind a local HTTP server, serving the real qr-order.html + a stub config.js.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('esbuild');
const fake = require('./fake-supabase');

process.env.SUPABASE_URL = 'http://fake.local';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';

// --- load & shim the real edge function ---
let src = fs.readFileSync(path.join(__dirname, '../../supabase/functions/tenant-public/index.ts'), 'utf8');
src = src
  .replace('import { serve } from "https://deno.land/std@0.168.0/http/server.ts";', '')
  .replace('import { createClient } from "https://esm.sh/@supabase/supabase-js@2";', '');
const js = transformSync(src, { loader: 'ts' }).code;
let handler = null;
const sandboxGlobals = {
  serve: h => { handler = h; },
  createClient: fake.createClient,
  Deno: { env: { get: k => process.env[k] } },
  console, crypto, fetch, Request, Response, Headers, TextEncoder, TextDecoder, URL, setTimeout,
};
const fn = new Function(...Object.keys(sandboxGlobals), js);
fn(...Object.values(sandboxGlobals));
if (!handler) { console.error('edge function did not register a handler'); process.exit(1); }

// --- seed tenant data ---
const TENANT_ID = '11111111-2222-3333-4444-555555555555';
function seed() {
  Object.keys(fake.rateBuckets).forEach(k => delete fake.rateBuckets[k]);
  fake.db.saas_tenants.length = 0;
  fake.db.doppio_menu.length = 0;
  fake.db.doppio_business_profile.length = 0;
  fake.db.doppio_pending_orders.length = 0;
  fake.db.doppio_bills.length = 0;
  fake.db.doppio_notifications.length = 0;
  fake.db.doppio_table_sessions.length = 0;
  fake.db.saas_tenants.push({ id: TENANT_ID, slug: 'testcafe', name: 'Test Cafe', status: 'approved', plan_code: 'growth', subscription_status: 'active' });
  fake.db.doppio_menu.push(
    { tenant_id: TENANT_ID, id: 1, name: 'Masala Dosa', price: 120, category: 'South Indian' },
    { tenant_id: TENANT_ID, id: 2, name: 'Paneer Tikka', price: 240, category: 'Starters' },
    { tenant_id: TENANT_ID, id: 3, name: 'Cold Coffee', price: 90, category: 'Beverages' },
  );
  fake.db.doppio_business_profile.push({ tenant_id: TENANT_ID, business_name: 'Test Cafe', address: 'MG Road', phone: '9999999999', upi_vpa: 'testcafe@upi', feature_flags: JSON.stringify({ ui_settings: { set_currency: 'INR (₹)', set_country: 'India' } }) });
  fake.db.doppio_table_sessions.push(
    { id: 'session-5', tenant_id: TENANT_ID, table_number: '5', session_token: 'test-token-5', status: 'active', created_at: new Date().toISOString() },
    { id: 'session-6', tenant_id: TENANT_ID, table_number: '6', session_token: 'test-token-6', status: 'active', created_at: new Date().toISOString() },
    { id: 'session-7', tenant_id: TENANT_ID, table_number: '7', session_token: 'test-token-7', status: 'active', created_at: new Date().toISOString() },
    { id: 'session-9', tenant_id: TENANT_ID, table_number: '9', session_token: 'test-token-9', status: 'active', created_at: new Date().toISOString() }
  );
}
seed();

// --- HTTP server: edge function + static + test-admin endpoints ---
const SITE = path.join(__dirname, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname === '/functions/v1/tenant-public') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request('http://localhost/functions/v1/tenant-public', {
        method: req.method,
        headers: { 'content-type': 'application/json', 'x-forwarded-for': req.socket.remoteAddress || '127.0.0.1' },
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    // test-admin: manipulate DB state (simulates POS/KDS actions)
    if (u.pathname === '/__admin' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      let out = { ok: true };
      if (body.op === 'seed') seed();
      else if (body.op === 'insert') fake.db[body.table].push(...body.rows.map(r => ({ tenant_id: TENANT_ID, created_at: new Date().toISOString(), ...r })));
      else if (body.op === 'set_status') { fake.db.doppio_pending_orders.filter(r => r.orderId === body.orderId).forEach(r => r.status = body.status); }
      else if (body.op === 'settle') {
        // move pending order to bills (POS checkout behaviour)
        const idx = fake.db.doppio_pending_orders.findIndex(r => r.orderId === body.orderId);
        if (idx >= 0) { const [o] = fake.db.doppio_pending_orders.splice(idx, 1); fake.db.doppio_bills.push({ tenant_id: TENANT_ID, orderId: o.orderId, table: o.tableNumber, items: o.items, total: o.total, paymentMethod: body.paymentMethod || 'Cash', dateTime: new Date().toISOString() }); }
      }
      else if (body.op === 'dump') out = { ok: true, db: fake.db };
      else if (body.op === 'rate_limits') require('./fake-supabase').setRateLimits(!!body.enabled);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
      return;
    }
    // stub config.js (page loads it before anything)
    if (u.pathname === '/config.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end('window.__SUPABASE_URL__="";window.__SUPABASE_ANON_KEY__="test-anon";window.__configReady=Promise.resolve();');
      return;
    }
    // static
    let p = u.pathname === '/' ? '/qr-order.html' : u.pathname;
    const file = path.join(SITE, p);
    if (file.startsWith(SITE) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404); res.end('not found: ' + p);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});
const PORT = process.env.PORT || 4310;
server.listen(PORT, () => console.log('harness listening on ' + PORT));
