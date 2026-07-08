'use strict';
// DOM-level E2E: real qr-order.html + real service-alerts.js running in jsdom
// against the real edge-function harness on :4310.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const BASE = 'http://localhost:4310';
let pass = 0, fail = 0;
function ok(c, name, extra) { if (c) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra !== undefined ? String(extra).slice(0,200) : ''); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function admin(body) { const r = await fetch(BASE + '/__admin', { method: 'POST', body: JSON.stringify(body) }); return r.json(); }

function makeDom(html, url) {
  const vc = new VirtualConsole();
  vc.on('log', (...args) => console.log('    [JSDOM LOG]', ...args));
  vc.on('error', (err) => console.error('    [JSDOM ERROR]', err.message || err));
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.__SUPABASE_URL__ = '';
      window.__SUPABASE_ANON_KEY__ = 'test-anon';
      window.__configReady = Promise.resolve();
      // route fetch through node, resolving relative URLs against the harness
      window.fetch = (u, opts) => fetch(new URL(u, BASE).href, opts);
      window.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){} });
    }
  });
  return dom;
}

(async () => {
  console.log('== UI Scenario A: customer tracker shows QR + waiter orders live ==');
  await admin({ op: 'seed' });
  
  // Fetch active session token for table 5
  const tokenRes = await (await fetch(BASE + '/functions/v1/tenant-public', { method: 'POST', body: JSON.stringify({ action: 'get_active_session', tenant_slug: 'testcafe', table: '5' }) })).json();
  const sessionToken = tokenRes.session_token;

  // seed one QR order + one waiter KOT on table 5
  await fetch(BASE + '/functions/v1/tenant-public', { method: 'POST', body: JSON.stringify({ action: 'create_order', tenant_slug: 'testcafe', session_token: sessionToken, order: { orderId: 'DO-QR-UITEST01', items: JSON.stringify([{ name: 'Masala Dosa', price: 120, qty: 2 }]), subtotal: 240, total: 240, paymentMethod: 'Cash', orderType: 'Dine-in', tableNumber: '5' } }) });
  await admin({ op: 'insert', table: 'doppio_pending_orders', rows: [{ orderId: 'KOT-77', items: JSON.stringify([{ name: 'Paneer Tikka', qty: 1, price: 240 }]), subtotal: 240, total: 240, paymentMethod: 'Cash', orderType: 'Dine-in', tableNumber: 'Table 5', status: 'preparing', dateTime: new Date().toISOString() }] });

  let html = fs.readFileSync(__dirname + '/../../qr-order.html', 'utf8')
    .replace(/<link[^>]+>/g, ''); // skip external fonts/fa in jsdom
  const dom = makeDom(html, BASE + '/qr-order.html?tenant=testcafe&table=5&token=' + encodeURIComponent(sessionToken));
  const { window } = dom;
  // config.js is external; jsdom will fetch it via resources:usable. Wait for scripts.
  await sleep(400);
  ok(typeof window.openModal === 'function', 'page script initialized');
  // simulate localStorage "my order"
  window.localStorage.setItem('doppio_pending_qr_orders', JSON.stringify([{ orderId: 'DO-QR-UITEST01', total: 240 }]));

  window.openModal('tracker-modal');
  await sleep(1500);
  const cardText = window.document.getElementById('tracker-box').textContent;
  ok(/DO-QR-UITEST01/.test(cardText), 'tracker shows order ID', cardText);
  const steps = [...window.document.querySelectorAll('.timeline-step')];
  ok(steps.length === 4, 'four timeline steps rendered', steps.length);
  const activeStep = window.document.querySelector('.timeline-step.active');
  ok(activeStep && activeStep.textContent.includes('Order Placed'), 'first step is active', activeStep ? activeStep.textContent : 'none');

  console.log('== UI Scenario B: live update reflects kitchen status change (8s poll) ==');
  await admin({ op: 'set_status', orderId: 'DO-QR-UITEST01', status: 'Served' });
  await sleep(8600);
  const activeStep2 = window.document.querySelector('.timeline-step.active');
  ok(activeStep2 && activeStep2.textContent.includes('Served Hot'), 'status auto-updated to Served Hot without reload', activeStep2 ? activeStep2.textContent : 'none');

  console.log('== UI Scenario C: checkout totals both unpaid orders ==');
  window.closeModal('tracker-modal');
  window.openModal('checkout-modal');
  await sleep(1200);
  const co = window.document.getElementById('checkout-box').textContent;
  ok(/240/.test(co), 'running bill = 240', co.slice(0,150));

  console.log('== UI Scenario D: service request + cooldown ==');
  window.sendServiceRequest('Drinking Water', 'w');
  await sleep(700);
  let dump = await admin({ op: 'dump' });
  let calls = dump.db.doppio_notifications.filter(n => n.type === 'waiter_call');
  ok(calls.length === 1, 'waiter call created from UI', calls.length);
  ok(calls[0].title === 'Table 5 Call', 'call title carries table');
  window.sendServiceRequest('Drinking Water', 'w'); // immediate retry -> client cooldown
  await sleep(700);
  dump = await admin({ op: 'dump' });
  calls = dump.db.doppio_notifications.filter(n => n.type === 'waiter_call');
  ok(calls.length === 1, 'client cooldown blocked instant repeat', calls.length);
  const toast = window.document.getElementById('toast-message').textContent;
  ok(/Paging Waiter/.test(toast), 'cooldown toast shown', toast);
  dom.window.close();

  console.log('== UI Scenario E: staff alert module (real service-alerts.js) ==');
  const alertsSrc = fs.readFileSync(__dirname + '/../../assets/service-alerts.js', 'utf8');
  const staffDom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'http://localhost:4310/dashboard.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const W = staffDom.window;
  W.sessionStorage.setItem('logged_in_role', 'waiter');
  // fake RS_DB backed by harness notifications table
  const puts = [];
  W.RS_DB = {
    isCloud: true,
    listCloud: async () => { const d = await admin({ op: 'dump' }); return d.db.doppio_notifications.map(n => ({ id: n.id, title: n.title, message: n.message, type: n.type, isRead: !!n.isRead, timestamp: n.timestamp, createdAt: n.created_at })); },
    listLocal: async () => [],
    writeLocal: async () => {},
    put: async (coll, id, obj) => { puts.push({ coll, id, obj }); return obj; },
  };
  W.navigator.vibrate = () => true;
  W.eval(alertsSrc);
  // module waits 1200ms then polls
  await sleep(2200);
  let cardEls = W.document.querySelectorAll('.rs-sa-card');
  ok(cardEls.length === 1, 'staff alert card rendered for waiter call', cardEls.length);
  const cardTxt = W.document.getElementById('rs-service-alerts').textContent;
  ok(/Table 5/.test(cardTxt), 'alert shows table number', cardTxt);
  ok(/Drinking Water/.test(cardTxt), 'alert shows request', cardTxt);
  ok(/On it/.test(cardTxt), 'acknowledge button present');
  // acknowledge
  W.document.querySelector('.rs-sa-ack').click();
  await sleep(300);
  ok(W.document.querySelectorAll('.rs-sa-card').length === 0, 'card cleared after acknowledge');
  ok(puts.length === 1 && puts[0].obj.isRead === true, 'ack synced to cloud (isRead=true)', JSON.stringify(puts));
  staffDom.window.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('SUITE ERROR', e); process.exitCode = 2; });
