'use strict';
const BASE = 'http://localhost:4310';
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}
async function api(body) {
  const r = await fetch(BASE + '/functions/v1/tenant-public', { method: 'POST', body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}
async function admin(body) {
  const r = await fetch(BASE + '/__admin', { method: 'POST', body: JSON.stringify(body) });
  return r.json();
}

(async () => {
  console.log('== Scenario 1: QR self-order appears in table tracker ==');
  await admin({ op: 'seed' });

  // Get active session tokens
  let s5 = await api({ action: 'get_active_session', tenant_slug: 'testcafe', table: '5' });
  const token5 = s5.json.session_token;

  let s6 = await api({ action: 'get_active_session', tenant_slug: 'testcafe', table: '6' });
  const token6 = s6.json.session_token;

  let s7 = await api({ action: 'get_active_session', tenant_slug: 'testcafe', table: '7' });
  const token7 = s7.json.session_token;

  let s9 = await api({ action: 'get_active_session', tenant_slug: 'testcafe', table: '9' });
  const token9 = s9.json.session_token;

  const qrId = 'DO-QR-' + Date.now().toString(36).toUpperCase() + '-T5';
  let r = await api({ action: 'create_order', tenant_slug: 'testcafe', session_token: token5, order: {
    orderId: qrId, items: JSON.stringify([{ name: 'Masala Dosa', price: 120, qty: 2 }]),
    subtotal: 240, total: 240, paymentMethod: 'Cash', orderType: 'Dine-in', tableNumber: '5' } });
  ok(r.json.success === true, 'QR order created', r.json);

  r = await api({ action: 'get_table_orders', tenant_slug: 'testcafe', session_token: token5, table: '5' });
  ok(r.status === 200 && r.json.orders.length === 1, 'tracker shows 1 order for table 5', r.json);
  ok(r.json.orders[0].source === 'qr', 'order tagged as qr source', r.json.orders[0]);
  ok(r.json.orders[0].status === 'Pending Review', 'status starts Pending Review');
  ok(r.json.orders[0].items[0].name === 'Masala Dosa' && r.json.orders[0].items[0].qty === 2, 'items visible');

  console.log('== Scenario 2: waiter-taken KOT (POS format "Table 5") visible on same table QR ==');
  await admin({ op: 'insert', table: 'doppio_pending_orders', rows: [{
    orderId: 'KOT-42', customerName: 'Walk-in Guest', items: JSON.stringify([{ name: 'Paneer Tikka', qty: 1, price: 240 }]),
    subtotal: 240, total: 240, paymentMethod: 'Cash', orderType: 'Dine-in', tableNumber: 'Table 5',
    status: 'Pending Review', dateTime: new Date().toISOString() }] });
  r = await api({ action: 'get_table_orders', tenant_slug: 'testcafe', session_token: token5, table: '5' });
  ok(r.json.orders.length === 2, 'both QR + waiter orders returned', r.json.orders.map(o=>o.orderId));
  const kot = r.json.orders.find(o => o.orderId === 'KOT-42');
  ok(kot && kot.source === 'staff', 'waiter order tagged staff source', kot);

  console.log('== Scenario 3: table normalization variants ==');
  for (const variant of ['05', 'T5', 'table-5', 'Table 05']) {
    r = await api({ action: 'get_table_orders', tenant_slug: 'testcafe', session_token: token5, table: variant });
    ok(r.json.orders.length === 2, `variant "${variant}" matches`, r.json.orders.length);
  }
  r = await api({ action: 'get_table_orders', tenant_slug: 'testcafe', session_token: token6, table: '6' });
  ok(r.json.orders.length === 0, 'table 6 sees nothing (isolation)');

  console.log('== Scenario 4: kitchen status flow reflected live ==');
  for (const st of ['Accepted', 'preparing', 'Ready', 'served']) {
    await admin({ op: 'set_status', orderId: qrId, status: st });
    r = await api({ action: 'get_table_orders', tenant_slug: 'testcafe', session_token: token5, table: '5' });
    const o = r.json.orders.find(x => x.orderId === qrId);
    ok(o && o.status === st, `status "${st}" visible to customer`, o && o.status);
  }

  console.log('== Scenario 5: settle to bill -> Paid ==');
  await admin({ op: 'settle', orderId: qrId, paymentMethod: 'UPI' });
  r = await api({ action: 'get_table_orders', tenant_slug: 'testcafe', session_token: token5, table: '5' });
  const paid = r.json.orders.find(x => x.orderId === qrId);
  ok(paid && paid.status === 'Paid', 'settled order shows Paid', paid);
  ok(r.json.orders.find(x => x.orderId === 'KOT-42').status === 'Pending Review', 'other order unaffected');

  console.log('== Scenario 6: waiter call + dedupe ==');
  r = await api({ action: 'create_notification', tenant_slug: 'testcafe', session_token: token5, title: 'Table 5 Call', message: 'Dine-in Customer requested: Drinking Water', type: 'waiter_call', table: '5' });
  ok(r.json.success === true && !r.json.deduped, 'first waiter call stored', r.json);
  ok(String(r.json.id || '').startsWith('wcall_'), 'waiter call id prefixed wcall_', r.json.id);
  r = await api({ action: 'create_notification', tenant_slug: 'testcafe', session_token: token5, title: 'Table 5 Call', message: 'Dine-in Customer requested: Drinking Water', type: 'waiter_call', table: '5' });
  ok(r.json.success === true && r.json.deduped === true, 'duplicate within 45s deduped', r.json);
  r = await api({ action: 'create_notification', tenant_slug: 'testcafe', session_token: token5, title: 'Table 5 Call', message: 'Dine-in Customer requested: Clear Table', type: 'waiter_call', table: '5' });
  ok(r.json.success === true && !r.json.deduped, 'different request from same table allowed', r.json);
  r = await api({ action: 'create_notification', tenant_slug: 'testcafe', session_token: token7, title: 'Table 7 Call', message: 'Dine-in Customer requested: Drinking Water', type: 'waiter_call', table: '7' });
  ok(r.json.success === true && !r.json.deduped, 'same request from another table allowed', r.json);
  const dump = await admin({ op: 'dump' });
  const calls = dump.db.doppio_notifications.filter(n => n.type === 'waiter_call');
  ok(calls.length === 3, '3 unique calls stored', calls.length);
  ok(calls.every(n => n.role === 'staff' && n.isRead === false), 'calls stored unread for staff');

  console.log('== Scenario 7: rate limit protects notification spam ==');
  let got429 = false;
  for (let i = 0; i < 15; i++) {
    r = await api({ action: 'create_notification', tenant_slug: 'testcafe', session_token: token9, title: 'Table 9 Call', message: 'Dine-in Customer requested: spam ' + i, type: 'waiter_call', table: '9' });
    if (r.status === 429) { got429 = true; break; }
  }
  ok(got429, 'spam eventually hits 429 rate limit');

  console.log('== Scenario 8: legacy get_order_status still works ==');
  await admin({ op: 'seed' });
  const qr2 = 'DO-QR-LEGACY01';
  await api({ action: 'create_order', tenant_slug: 'testcafe', order: { orderId: qr2, items: JSON.stringify([{ name: 'Cold Coffee', price: 90, qty: 1 }]), subtotal: 90, total: 90, paymentMethod: 'Cash', orderType: 'Takeaway', tableNumber: 'Takeaway' } });
  r = await api({ action: 'get_order_status', tenant_slug: 'testcafe', orderId: qr2 });
  ok(r.json.order && r.json.order.status === 'Pending Review', 'legacy status lookup OK', r.json);

  console.log('== Scenario 9: bad inputs rejected ==');
  r = await api({ action: 'get_table_orders', tenant_slug: 'testcafe', table: '' });
  ok(r.status === 400 || r.status === 403, 'empty table rejected', r.status);
  r = await api({ action: 'get_table_orders', tenant_slug: 'nosuchcafe', table: '5' });
  ok(r.status === 404, 'unknown tenant rejected');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR', e); process.exit(2); });
