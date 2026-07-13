'use strict';
/**
 * 1) Unit: floor state priority (empty seat / hold / meaty tickets)
 * 2) Browser: mint session → dashboard → seed seat+hold → assert Held on floor
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.RS_E2E_BASE || 'https://restrosuite.codearc.co.in';
const results = [];
function ok(n, d) {
  results.push({ n, pass: true, d: d || '' });
  console.log('  PASS  ' + n + (d ? ' — ' + d : ''));
}
function fail(n, d) {
  results.push({ n, pass: false, d: String(d || '') });
  console.log('  FAIL  ' + n + ' — ' + d);
}

function loadEnv() {
  const out = { ...process.env };
  const p = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!out[k]) out[k] = v;
  }
  return out;
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function mintSession(payload, secret) {
  const body = { ...payload, exp: Date.now() + 8 * 60 * 60 * 1000 };
  const payloadEncoded = b64url(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
  return `${payloadEncoded}.${signature}`;
}

// ── Unit ──────────────────────────────────────────────────────────
function dig(v) {
  return parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
}
function matchTable(row, t) {
  const tn = String(row.tableNumber || row.table || row.draftName || '').trim();
  const a = dig(t.n);
  const b = dig(tn);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
function itemCount(row) {
  const items = (row && row.items) || [];
  return items.reduce((n, it) => n + (Array.isArray(it) ? 1 : Math.max(1, Number(it.qty || 1))), 0);
}
function floorState(t, pending, drafts) {
  const active = (pending || []).filter(
    (r) =>
      matchTable(r, t) &&
      ['DineIn Active', 'Accepted', 'preparing', 'Pending Review', 'Billed', 'Ready', 'served'].includes(r.status)
  );
  const meaty = active.filter((o) => itemCount(o) > 0 || Number(o.total) > 0);
  const empty = active.filter((o) => itemCount(o) <= 0 && !(Number(o.total) > 0));
  const draft = (drafts || []).find((d) =>
    matchTable({ tableNumber: d.draftName || d.table || d.tableNumber }, t)
  );
  if (draft && !meaty.length) return { state: 'held', amt: Number(draft.total) || 0, itemCount: itemCount(draft) };
  if (meaty.length) return { state: 'occupied', amt: meaty.reduce((s, o) => s + (Number(o.total) || 0), 0) };
  if (empty.length) return { state: 'occupied', emptySeat: true, amt: 0 };
  return { state: 'free' };
}

console.log('\n=== Unit: floor priority (user-repro) ===');
{
  const t = { n: '01' };
  const seatOnly = [{ tableNumber: 'Table 01', status: 'DineIn Active', items: [], total: 0, source: 'floor_seat' }];
  const draft = [{ draftName: 'Table 01', tableNumber: 'Table 01', items: [{ name: 'Tea', qty: 2, price: 20 }], total: 40 }];
  let s = floorState(t, seatOnly, []);
  if (s.state === 'occupied' && s.emptySeat) ok('after Seat: empty → Seated/occupied');
  else fail('after Seat empty', JSON.stringify(s));
  // BUG user saw: seat left + hold draft → was dining; must be held
  s = floorState(t, seatOnly, draft);
  if (s.state === 'held' && s.amt === 40) ok('after Hold with seat ticket: Held ₹40');
  else fail('after Hold with seat ticket', JSON.stringify(s));
  s = floorState(t, [], draft);
  if (s.state === 'held') ok('after Hold cleaned seat: Held');
  else fail('after Hold cleaned', JSON.stringify(s));
  s = floorState(
    t,
    [{ tableNumber: 'Table 01', status: 'DineIn Active', items: [{ name: 'Tea', qty: 1, price: 20 }], total: 20 }],
    draft
  );
  if (s.state === 'occupied' && s.amt === 20) ok('kitchen ticket beats draft');
  else fail('kitchen ticket', JSON.stringify(s));
}

// ── Browser with minted session ───────────────────────────────────
(async () => {
  console.log('\n=== Browser (minted session + floor hold) ===');
  const env = loadEnv();
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    fail('Env', 'SUPABASE_URL / ANON missing');
    finish();
    return;
  }
  let session;
  try {
    const loginRes = await fetch(url + '/functions/v1/tenant-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: 'Bearer ' + anon,
      },
      body: JSON.stringify({ action: 'login', slug: 'bbb', username: 'bbb', password: 'Harry@1234' }),
    });
    const loginJ = await loginRes.json();
    session = loginJ && loginJ.session;
  } catch (e) {
    fail('API login', e.message);
    finish();
    return;
  }
  if (!session || !session.session_token) {
    fail('API login', 'no session_token');
    finish();
    return;
  }
  ok('API login bbb', session.tenant_slug || 'bbb');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(60000);

  try {
    // Inject real login session before app boot
    await page.addInitScript((s) => {
      try {
        sessionStorage.setItem('tenant_session_token', s.session_token);
        sessionStorage.setItem('tenant_id', s.tenant_id || '');
        sessionStorage.setItem('tenant_slug', s.tenant_slug || 'bbb');
        sessionStorage.setItem('tenant_name', s.tenant_name || 'BBB');
        sessionStorage.setItem('logged_in_role', s.role || 'admin');
        sessionStorage.setItem('logged_in_user', s.username || 'bbb');
        sessionStorage.setItem('logged_in_display', s.username || 'bbb');
        sessionStorage.setItem('allowed_tabs', JSON.stringify(s.allowed_tabs || []));
      } catch (_) {}
    }, session);
    await page.goto(BASE + '/dashboard.html?appv=v116#floor-tab', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    // Wait for data layer (RS_DB) — may take a few seconds after session validate
    try {
      await page.waitForFunction(() => !!(window.RS_DB && window.RS), { timeout: 25000 });
    } catch (_) {}
    await page.waitForTimeout(2000);

    const boot = await page.evaluate(() => ({
      hasAPI: !!(window.RS_API && RS_API.session),
      hasDB: !!window.RS_DB,
      hasRS: !!window.RS,
      role: sessionStorage.getItem('logged_in_role'),
      url: location.href,
      body: (document.body && document.body.innerText.slice(0, 100)) || '',
    }));
    if (!boot.hasDB) {
      fail('Dashboard RS_DB', JSON.stringify(boot));
    } else {
      ok('Dashboard session', 'role=' + boot.role + ' db=' + boot.hasDB + ' url=' + (boot.url || '').slice(0, 60));

      try {
        await page.evaluate(async () => {
          if (!window.RS_DB) throw new Error('no RS_DB');
          const dig = (v) => parseInt(String(v == null ? '' : v).replace(/\D/g, ''), 10);
          const is12 = (raw) => dig(raw) === 12;
          const pend = await RS_DB.list('pending_orders').catch(() => []);
          for (const r of pend || []) {
            if (is12(r.tableNumber || r.table)) await RS_DB.del('pending_orders', r.id).catch(() => {});
          }
          const drafts = await RS_DB.list('drafts').catch(() => []);
          for (const d of drafts || []) {
            if (is12(d.draftName || d.table || d.tableNumber)) await RS_DB.del('drafts', d.id).catch(() => {});
          }
        });
        ok('Clean table 12 data');

        await page.evaluate(async () => {
          const seatId = 'e2e_seat_12_' + Date.now();
          await RS_DB.put('pending_orders', seatId, {
            id: seatId,
            orderId: seatId,
            tableNumber: 'Table 12',
            table: 'Table 12',
            status: 'DineIn Active',
            items: [],
            total: 0,
            source: 'floor_seat',
            dateTime: new Date().toISOString(),
          });
          window.__e2eSeatId = seatId;
          document.dispatchEvent(new Event('rs:tables-updated'));
        });
        await page.waitForTimeout(1500);
        await page
          .evaluate(() => {
            if (window.RS && RS.activateTab) RS.activateTab('floor-tab');
          })
          .catch(() => {});
        await page.waitForTimeout(2000);

        const afterSeat = await page.evaluate(() => {
          const card = [...document.querySelectorAll('#floor-tab .table-card')].find((c) =>
            String(c.getAttribute('data-n') || '').includes('12')
          );
          return card
            ? { cls: card.className, text: card.innerText.replace(/\s+/g, ' ').trim().slice(0, 140) }
            : null;
        });
        if (afterSeat && /occupied|seated|dining/i.test(afterSeat.cls + ' ' + afterSeat.text)) {
          ok('After seat UI', afterSeat.text);
        } else {
          fail('After seat UI', JSON.stringify(afterSeat));
        }

        await page.evaluate(async () => {
          const draftId = Date.now();
          await RS_DB.put('drafts', draftId, {
            id: draftId,
            draftId: 'D-E2E12',
            draftName: 'Table 12',
            name: 'Table 12',
            table: 'Table 12',
            tableNumber: 'Table 12',
            items: [{ name: 'Masala Chai', qty: 2, price: 40 }],
            total: 80,
            orderType: 'dinein',
            time: '12:05 pm',
          });
          if (window.__e2eSeatId) await RS_DB.del('pending_orders', window.__e2eSeatId).catch(() => {});
          document.dispatchEvent(new Event('rs:tables-updated'));
        });
        await page.waitForTimeout(1500);
        await page
          .evaluate(() => {
            if (window.RS && RS.activateTab) RS.activateTab('floor-tab');
          })
          .catch(() => {});
        await page.waitForTimeout(2500);

        const afterHold = await page.evaluate(() => {
          const card = [...document.querySelectorAll('#floor-tab .table-card')].find((c) =>
            String(c.getAttribute('data-n') || '').includes('12')
          );
          return card
            ? { cls: card.className, text: card.innerText.replace(/\s+/g, ' ').trim().slice(0, 140) }
            : null;
        });
        if (afterHold && (/held/i.test(afterHold.cls) || /held/i.test(afterHold.text))) {
          ok('After hold UI = Held', afterHold.text);
        } else {
          fail('After hold UI', JSON.stringify(afterHold));
        }
      } catch (e2) {
        fail('Simulate', e2.message);
      }

      await page.screenshot({ path: path.join(__dirname, 'floor-hold-e2e.png') });
      ok('Screenshot', 'scratch/floor-hold-e2e.png');
    }
  } catch (e) {
    fail('Browser', e.message);
  }

  await browser.close();
  finish();
})().catch((e) => {
  console.error(e);
  process.exit(2);
});

function finish() {
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n==== ' + passed + ' passed, ' + failed + ' failed ====');
  fs.writeFileSync(
    path.join(__dirname, 'e2e-floor-hold-summary.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2)
  );
  process.exit(failed > 0 ? 1 : 0);
}
