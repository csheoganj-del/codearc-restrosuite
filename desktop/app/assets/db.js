/* ============================================================
   RestroSuite -- Data layer
   Routes through the Doppio Supabase Edge Functions (tenant-data)
   when configured + signed in; otherwise localStorage (demo).

   Public API (unchanged):
     RS_DB.mode  -> 'cloud' | 'local'
     await RS_DB.list(collection)
     await RS_DB.put(collection, id, obj)
     await RS_DB.bulkPut(collection, array)
     await RS_DB.del(collection, id)
     await RS_DB.getSettings() / setSettings(obj)
   Auth delegates to RS_API when cloud-configured.

   Collections map to your real doppio_* tables:
     menu->doppio_menu  bills->doppio_bills  inventory->doppio_inventory
     customers->doppio_crm  employees->doppio_employees  drafts->doppio_draft_orders
     settings->doppio_business_profile
   ============================================================ */
(function(){
  'use strict';
  /* --- Scope localStorage per Tenant to Prevent Cross-Tenant Data Leaks --- */
  (function scopeLocalStorage() {
    const originalGet = localStorage.getItem;
    const originalSet = localStorage.setItem;
    const originalRemove = localStorage.removeItem;

    function getTenantId() {
      try {
        const tid = sessionStorage.getItem('tenant_id');
        if (tid) return tid;
        const localTid = originalGet.call(localStorage, 'tenant_id');
        if (localTid) return localTid;

        const sLocal = JSON.parse(originalGet.call(localStorage, 'rs:session') || 'null');
        if (sLocal && sLocal.tenant_id) return sLocal.tenant_id;
        if (sLocal && sLocal.user && sLocal.user.id) return sLocal.user.id;
      } catch(e) {}
      return 'local-demo';
    }

    function scopeKey(key) {
      const prefixes = ['rs_v2:', 'rs_active_cart', 'rs_active_order_type', 'rs_tab_cart_', 'rs_tab_cust_', 'rs_pre_update_'];
      if (prefixes.some(p => key.startsWith(p))) {
        const tenant = getTenantId();
        return `rs:${tenant}:${key}`;
      }
      return key;
    }

    localStorage.getItem = function(key) {
      return originalGet.call(localStorage, scopeKey(key));
    };
    localStorage.setItem = function(key, val) {
      return originalSet.call(localStorage, scopeKey(key), val);
    };
    localStorage.removeItem = function(key) {
      return originalRemove.call(localStorage, scopeKey(key));
    };
  })();

  function refreshRuntimeConfig() {
    try {
      if (window.RS_API && RS_API.refreshConfig) RS_API.refreshConfig();
    } catch(e) {}
  }
  function isCloudConfigured() {
    refreshRuntimeConfig();
    return !!(window.RS_API && window.RS_API.configured);
  }
  function isTenantDataSession() {
    if (!isCloudConfigured() || !window.RS_API || !window.RS_API.session) return false;
    const s = window.RS_API.session();
    if (!s) return false;
    return s.role !== 'superadmin' && s.role !== 'brand_admin';
  }
  function signedIn(){ return isTenantDataSession(); }
  function mode(){ return signedIn() ? 'cloud' : 'local'; }

  function getActiveTenantId() {
    if (isCloudConfigured() && window.RS_API && window.RS_API.session) {
      const s = window.RS_API.session();
      if (s && s.role !== 'superadmin' && s.role !== 'brand_admin' && s.tenant_id) return s.tenant_id;
    }
    try {
      const tid = sessionStorage.getItem('tenant_id');
      if (tid) return tid;
      const localTid = localStorage.getItem('tenant_id');
      if (localTid) return localTid;

      const sLocal = JSON.parse(localStorage.getItem('rs:session') || 'null');
      if (sLocal && sLocal.tenant_id) return sLocal.tenant_id;
      if (sLocal && sLocal.user && sLocal.user.id) return sLocal.user.id;
    } catch(e) {}
    return 'local-demo';
  }

  /* ---------------- field mappers (app shape <-> doppio columns) ---------------- */
  const num = v => (v==null||v==='') ? 0 : Number(v);
  const parseItems = t => { try { const a=JSON.parse(t); return Array.isArray(a)?a:[]; } catch(e){ return []; } };
  const parseTenders = t => {
    if (!t) return [];
    if (typeof t !== 'string') return Array.isArray(t) ? t : [];
    try { const a=JSON.parse(t); return Array.isArray(a)?a:[]; } catch(e){ return []; }
  };

  function stableNumericId(str) {
    let hash = 5381;
    const clean = String(str || '').toLowerCase().trim();
    for (let i = 0; i < clean.length; i++) {
      hash = (hash * 33) ^ clean.charCodeAt(i);
    }
    return Math.abs(hash) % 9007199254740991;
  }

  function cleanIdForCollection(c, id) {
    if (id == null) return id;
    const isBigIntPK = ['menu', 'inventory', 'bills', 'customers', 'drafts', 'pending_orders'].includes(c);
    if (isBigIntPK) {
      if (Number.isFinite(Number(id))) {
        return Number(id);
      }
      // Salt string ids (e.g. bill numbers like "RS-20260702-001") with the
      // tenant id. These tables are shared across all tenants with a plain
      // numeric primary key, and every tenant's daily bill numbering starts
      // at -001, so unsalted hashes collide across tenants: only the first
      // restaurant to bill each day could save its bill, everyone else's
      // insert failed on doppio_bills_pkey and was silently dropped.
      return stableNumericId(getActiveTenantId() + ':' + id);
    }
    return id;
  }
  function fallbackLogicalCode(prefix) {
    const now = new Date();
    const day = String(now.getFullYear()).slice(-2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const cleanPrefix = String(prefix || 'NO').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'NO';
    const key = `rs_seq:${getActiveTenantId()}:${cleanPrefix}:${day}`;
    let next = 1;
    try {
      next = (Number(localStorage.getItem(key) || 0) || 0) + 1;
      localStorage.setItem(key, String(next));
    } catch(e) {}
    return `${cleanPrefix}-${day}-${String(next).padStart(3, '0')}`;
  }

  const MAP = {
    menu: {
      table:'doppio_menu', pk:'id', clientId:true,
      from: r => ({ id:r.id, name:r.name, cat:r.category, price:num(r.price),
                    veg: !(r.recipe_specs && r.recipe_specs.veg===false),
                    stock: r.available===false ? 'out' : 'ok',
                    ingredients: (r.recipe_specs && r.recipe_specs.ingredients) || [],
                    taxCategory: r.tax_category || 'IN_REST_5' }),
      to: o => ({ id:o.id, name:o.name, category:o.cat, price:num(o.price),
                  available: o.stock!=='out',
                  recipe_specs: { veg: !!o.veg, ingredients: o.ingredients || [] },
                  tax_category: o.taxCategory || 'IN_REST_5' })
    },
    bills: {
      table:'doppio_bills', pk:'id', clientId:false, order:{column:'created_at',ascending:false},
      from: r => ({ id:r.id, no:r.order_id, time:r.date_time, table:'--',
                    _items:parseItems(r.items),
                    items: parseItems(r.items).reduce((a,i)=>a+(i.qty||1),0) || parseItems(r.items).length,
                    subtotal:num(r.subtotal), gst:num(r.gst), cgst:num(r.cgst), sgst:num(r.sgst),
                    amount:num(r.total), pay:r.payment_method, status:r.status || 'paid',
                    refundReason:r.refund_reason || '',
                    refundedAt:r.refunded_at || '',
                    customerName:r.customer_name, customerPhone:r.customer_phone,
                    tenders:parseTenders(r.tenders), change:num(r.change),
                    taxSummary: typeof r.tax_summary === 'string' ? JSON.parse(r.tax_summary) : (r.tax_summary || []),
                    channel: r.channel || 'dine_in',
                    taxProfile: typeof r.tax_profile === 'string' ? JSON.parse(r.tax_profile) : (r.tax_profile || {}),
                    liquorTaxAmount: num(r.liquor_tax_amount),
                    serviceChargeAmount: num(r.service_charge_amount) }),
      to: o => ({ id:o.id, order_id:o.no, customer_name:o.customerName||'Walk-in Guest', customer_phone:o.customerPhone||null,
                  items: JSON.stringify(o._items||[]), subtotal:num(o.subtotal), gst:num(o.gst),
                  cgst:num(o.cgst), sgst:num(o.sgst), igst:0, total:num(o.amount),
                  payment_method:o.pay||'UPI', date_time:o.time||new Date().toISOString(), transaction_type:'intra',
                  tenders: Array.isArray(o.tenders) ? JSON.stringify(o.tenders) : o.tenders || '[]',
                  change: num(o.change || 0),
                  tax_summary: Array.isArray(o.taxSummary) ? JSON.stringify(o.taxSummary) : (o.taxSummary ? JSON.stringify([o.taxSummary]) : '[]'),
                  channel: o.channel || 'dine_in',
                  tax_profile: typeof o.taxProfile === 'object' ? JSON.stringify(o.taxProfile) : (o.taxProfile || '{}'),
                  liquor_tax_amount: num(o.liquorTaxAmount),
                  service_charge_amount: num(o.serviceChargeAmount),
                  status: o.status || 'paid',
                  refund_reason: o.refundReason || '',
                  refunded_at: o.refundedAt || null })
    },
    tax_rates: {
      table:'doppio_tax_rates', pk:'id', clientId:true,
      from: r => ({ id:r.id, country:r.country, rateCode:r.rate_code, label:r.label,
                    percent:num(r.percent), validFrom:r.valid_from, validTo:r.valid_to,
                    itcAllowed:!!r.itc_allowed, notes:r.notes||'' }),
      to: o => ({ id:o.id, country:o.country, rate_code:o.rateCode, label:o.label,
                  percent:num(o.percent), valid_from:o.validFrom, valid_to:o.validTo||null,
                  itc_allowed:!!o.itcAllowed, notes:o.notes||'' })
    },
    inventory: {
      table:'doppio_inventory', pk:'id', clientId:true,
      from: r => ({ id:r.id, key:r.key, name:r.label||r.name, cat:r.category, stock:num(r.current),
                    unit:r.unit, min:num(r.threshold), max:num(r.max_stock), cost:0 }),
      to: o => ({ id:o.id, key:o.key||String(o.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'),
                  name:o.name, label:o.name, category:o.cat||'General', current:num(o.stock),
                  threshold:num(o.min), max_stock:num(o.max||o.stock), unit:o.unit||'unit' })
    },
    customers: {
      table:'doppio_crm', pk:'id', clientId:false, order:{column:'last_visit',ascending:false},
      from: r => ({ id:r.id, name:r.name, phone:r.phone, visits:num(r.visits), spend:num(r.total_spend),
                    email:r.email, last:r.last_visit, dues:num(r.dues), tier:(num(r.total_spend)>25000?'vip':num(r.total_spend)>12000?'gold':'silver') }),
      to: o => ({ id:o.id, name:o.name, phone:o.phone, visits:num(o.visits)||1, total_spend:num(o.spend),
                  email:o.email||'', dues:num(o.dues), marketing_opt_in:true })
    },
    notifications: {
      table:'doppio_notifications', pk:'id', clientId:true, order:{column:'created_at',ascending:false},
      from: r => ({ id:r.id, title:r.title, message:r.message, type:r.type||'info', role:r.role||'all',
                    timestamp:r.timestamp||r.created_at||'', isRead:!!r.is_read, createdAt:r.created_at }),
      to: o => ({ id:o.id, title:o.title||'', message:o.message||'', type:o.type||'info',
                  role:o.role||'all', timestamp:o.timestamp||new Date().toISOString(), is_read:!!o.isRead })
    },
    employees: {
      table:'doppio_employees', pk:'id', clientId:true,
      from: r => ({ id:r.id, name:r.name, role:r.role, rc:'r-'+String(r.role||'').toLowerCase(),
                    email:r.contact, baseSalary:num(r.base_salary), shift:r.shift }),
      to: o => ({ id:o.id, name:o.name, role:o.role, contact:o.email||'', base_salary:num(o.baseSalary), shift:o.shift||'Morning', daily_rate:0 })
    },
    drafts: {
      table:'doppio_draft_orders', pk:'id', clientId:true,
      from: r => ({ id:r.id, draftId:r.draft_id, name:r.draft_name, draftName:r.draft_name, customerName:r.customer_name, customerPhone:r.customer_phone, total:num(r.total),
                    items: parseItems(r.items) }),
      to: o => ({ id:o.id, draft_id:o.draftId||fallbackLogicalCode('D'), draft_name:o.draftName||o.name||o.table||'Held order',
                  customer_name:o.customerName||'', customer_phone:o.customerPhone||'', payment_method:'UPI',
                  items: JSON.stringify(o.items||[]), subtotal:num(o.subtotal), gst:num(o.gst), total:num(o.total) })
    },
    pending_orders: {
      table:'doppio_pending_orders', pk:'id', clientId:false,
      from: r => ({ id:r.id, orderId:r.order_id, customerName:r.customer_name, customerPhone:r.customer_phone,
                    items: parseItems(r.items), subtotal:num(r.subtotal), discount:num(r.discount),
                    gst:num(r.gst), total:num(r.total), paymentMethod:r.payment_method,
                    orderType:r.order_type, tableNumber:r.table_number, status:r.status, dateTime:r.date_time, priority:r.priority||'normal',
                    prepMinutes:(r.prep_minutes!=null?num(r.prep_minutes):null), prepStartedAt:r.prep_started_at||null }),
      to: o => ({ id:o.id, order_id:o.orderId, customer_name:o.customerName||'Guest', customer_phone:o.customerPhone||null,
                  items: JSON.stringify(o.items||[]), subtotal:num(o.subtotal), discount:num(o.discount),
                  gst:num(o.gst), total:num(o.total), payment_method:o.paymentMethod||'UPI',
                  order_type:o.orderType||'Dine-in', table_number:o.tableNumber||'Walk-in',
                  status:o.status||'Pending Review', date_time:o.dateTime||new Date().toISOString(), priority:o.priority||'normal',
                  prep_minutes:(o.prepMinutes!=null?num(o.prepMinutes):null), prep_started_at:o.prepStartedAt||null })
    },
    table_sessions: {
      table:'doppio_table_sessions', pk:'id', clientId:false,
      from: r => ({ id:r.id, tableNumber:r.table_number, token:r.session_token, status:r.status, createdAt:r.created_at, closedAt:r.closed_at, lastOrderAt:r.last_order_at }),
      to: o => ({ id:o.id, table_number:o.tableNumber, session_token:o.token, status:o.status, created_at:o.createdAt, closed_at:o.closedAt, last_order_at:o.lastOrderAt })
    },
    shifts: {
      table:'doppio_shifts', pk:'shift_id', clientId:true,
      from: r => ({ shiftId:r.shift_id, cashierName:r.cashier_name, openedAt:r.opened_at, closedAt:r.closed_at,
                    openingFloat:num(r.opening_float), expectedCash:num(r.expected_cash), actualCash:num(r.actual_cash),
                    variance:num(r.variance), totalSalesCash:num(r.total_sales_cash), totalSalesUpi:num(r.total_sales_upi),
                    totalSalesCard:num(r.total_sales_card), totalPayouts:num(r.total_payouts), totalSafeDrops:num(r.total_safe_drops),
                    status:r.status, notes:r.notes }),
      to: o => ({ shift_id:o.shiftId, cashier_name:o.cashierName||'', opened_at:o.openedAt, closed_at:o.closedAt||null,
                  opening_float:num(o.openingFloat), expected_cash:num(o.expectedCash), actual_cash:num(o.actualCash),
                  variance:num(o.variance), total_sales_cash:num(o.totalSalesCash), total_sales_upi:num(o.totalSalesUpi),
                  total_sales_card:num(o.totalSalesCard), total_payouts:num(o.totalPayouts), total_safe_drops:num(o.totalSafeDrops),
                  status:o.status||'OPEN', notes:o.notes||'' })
    },
    shift_events: {
      table:'doppio_shift_events', pk:'event_id', clientId:true,
      from: r => ({ eventId:r.event_id, shiftId:r.shift_id, eventType:r.event_type, amount:num(r.amount), reason:r.reason, createdAt:r.created_at }),
      to: o => ({ event_id:o.eventId, shift_id:o.shiftId, event_type:o.eventType, amount:num(o.amount), reason:o.reason||'', created_at:o.createdAt||new Date().toISOString() })
    },
    attendance: {
      table:'doppio_attendance', pk:'id', clientId:true,
      from: r => ({ id:r.id, employeeId:r.employee_id, employeeName:r.employee_name, date:r.date, clockInTime:r.clock_in_time, clockOutTime:r.clock_out_time, hoursWorked:num(r.hours_worked), status:r.status, wages:num(r.wages) }),
      to: o => ({ id:o.id, employee_id:o.employeeId, employee_name:o.employeeName, date:o.date, clock_in_time:o.clockInTime, clock_out_time:o.clockOutTime||null, hours_worked:num(o.hoursWorked), status:o.status||'Completed', wages:num(o.wages) })
    },
    leave_requests: {
      table:'doppio_leave_requests', pk:'id', clientId:true,
      from: r => ({ id:r.id, employeeId:r.employee_id, employeeName:r.employee_name, type:r.type, startDate:r.start_date, endDate:r.end_date, reason:r.reason, status:r.status, days:num(r.days) }),
      to: o => ({ id:o.id, employee_id:o.employeeId, employee_name:o.employeeName, type:o.type, start_date:o.startDate, end_date:o.endDate, reason:o.reason||'', status:o.status||'Pending', days:num(o.days) })
    },
    reservations: {
      table:'doppio_reservations', pk:'id', clientId:false, uuidPK:true,
      from: r => ({ id:r.id, guestName:r.guest_name, guestPhone:r.phone, pax:num(r.party_size), tableNumber:r.table_number, time:r.notes||'', date:(r.reserved_for||'').slice(0,10), status:r.status }),
      to: o => ({ guest_name:o.guestName||'Guest', phone:o.guestPhone||null, party_size:num(o.pax)||2, table_number:o.tableNumber||'', reserved_for:(function(){ try { if(o.date&&o.time){ var d=new Date(o.date+'T'+o.time); if(!isNaN(d)) return d.toISOString(); } } catch(e){} return o.reserved_for||new Date().toISOString(); })(), notes:o.time||'', status:o.status||'confirmed' })
    },
    offers: {
      table:'doppio_offers', pk:'id', clientId:false, uuidPK:true,
      from: r => ({ id:r.id, code:r.code, description:r.title, usageCount:num(r.usage_count), status:r.status }),
      to: o => ({ code:o.code||'', title:o.description||o.code||'Offer', usage_count:num(o.usageCount), status:o.status||'active' })
    },
    vendors: {
      table:'doppio_vendors', pk:'id', clientId:false, uuidPK:true,
      from: r => ({ id:r.id, name:r.name, category:r.category, contact:r.phone, terms:r.terms, rating:num(r.rating), itemsCount:num(r.items_count) }),
      to: o => ({ name:o.name, category:o.category||'', phone:o.contact||'', terms:o.terms||'', rating:num(o.rating), items_count:num(o.itemsCount) })
    },
    purchase_orders: {
      table:'doppio_purchase_orders', pk:'id', clientId:false, uuidPK:true,
      from: r => ({ id:r.id, poNumber:r.po_number, supplier:r.vendor_name, items:r.item_name, value:num(r.expected_cost), date:r.due_date, status:r.status }),
      to: o => ({ po_number:o.poNumber||'', vendor_name:o.supplier||'Supplier', item_name:o.items||'Supply items', expected_cost:num(o.value), due_date:(o.date||new Date().toISOString()).slice(0,10), status:o.status||'pending' })
    },
    support_tickets: {
      table:'doppio_support_tickets', pk:'id', clientId:false, uuidPK:true,
      from: r => ({ id:r.id, ticketNumber:r.ticket_number, subject:r.subject, customerName:r.customer_name, priority:r.priority, status:r.status }),
      to: o => ({ ticket_number:o.ticketNumber||'', subject:o.subject||'', customer_name:o.customerName||'', priority:o.priority||'medium', status:o.status||'open' })
    }
  };
  const conflictTargets = Object.freeze({
    businessProfile: { table: 'doppio_business_profile', onConflict: 'tenant_id' },
    menu: { table: 'doppio_menu', onConflict: 'tenant_id,name' },
    recipeCosting: { table: 'doppio_custom_recipes', onConflict: 'tenant_id,item_name' },
    billSql: 'ON CONFLICT (tenant_id, "orderId") DO UPDATE SET'
  });
  const optionalCloudColumns = Object.freeze({
    menu: ['tax_category']
  });
  const known = {}; // collection -> Set of ids seen from server
  function newClientId(){ return Date.now()*1000 + Math.floor(Math.random()*1000); }

  function omitUnsupportedOptionalColumns(collection, body, err) {
    const cols = optionalCloudColumns[collection] || [];
    if (!cols.length || !body) return false;
    const msg = String((err && err.message) || err || '');
    if (!/schema cache|Could not find|column|42703/i.test(msg)) return false;
    let changed = false;
    cols.forEach(col => {
      if (Object.prototype.hasOwnProperty.call(body, col) && msg.includes(col)) {
        delete body[col];
        changed = true;
      }
    });
    return changed;
  }

  /* ---------------- LOCAL (localStorage) ---------------- */
  const LS = {
    key:c=>'rs_v2:'+c,
    read:c=>{
      try{
        const val = localStorage.getItem(LS.key(c));
        if (val) return JSON.parse(val);
        if (c === 'tax_rates') {
          const defaultRates = [
            { id: 'IN_REST_5_demo', country: 'IN', rateCode: 'IN_REST_5', label: 'GST Restaurant AC/Non-AC', percent: 5.0, validFrom: '2025-09-22', validTo: null, itcAllowed: false, notes: 'Standalone restaurant' },
            { id: 'IN_REST_18_demo', country: 'IN', rateCode: 'IN_REST_18', label: 'GST Specified Premises', percent: 18.0, validFrom: '2025-09-22', validTo: null, itcAllowed: true, notes: 'Hotel room tariff >= ₹7,500/night' },
            { id: 'IN_CATER_18_demo', country: 'IN', rateCode: 'IN_CATER_18', label: 'GST Outdoor Catering', percent: 18.0, validFrom: '2025-09-22', validTo: null, itcAllowed: true, notes: 'Catering services' },
            { id: 'IN_COMP_5_demo', country: 'IN', rateCode: 'IN_COMP_5', label: 'GST Composition Scheme', percent: 5.0, validFrom: '2025-09-22', validTo: null, itcAllowed: false, notes: 'Flat 5% borne by restaurant' },
            { id: 'IN_GOODS_5_demo', country: 'IN', rateCode: 'IN_GOODS_5', label: 'GST Packaged Goods 5%', percent: 5.0, validFrom: '2025-09-22', validTo: null, itcAllowed: false, notes: 'Packaged food goods' },
            { id: 'IN_GOODS_18_demo', country: 'IN', rateCode: 'IN_GOODS_18', label: 'GST Branded Goods 18%', percent: 18.0, validFrom: '2025-09-22', validTo: null, itcAllowed: true, notes: 'Branded retail goods' },
            { id: 'IN_NIL_0_demo', country: 'IN', rateCode: 'IN_NIL_0', label: 'GST Nil Rated', percent: 0.0, validFrom: '2025-09-22', validTo: null, itcAllowed: false, notes: 'Essential foods' },
            { id: 'IE_FOOD_135_demo', country: 'IE', rateCode: 'IE_FOOD_135', label: 'VAT Hot Food (Pre-Jul 26)', percent: 13.5, validFrom: '2019-01-01', validTo: '2026-06-30', itcAllowed: true, notes: 'Restaurant food until 30-Jun-2026' },
            { id: 'IE_FOOD_9_demo', country: 'IE', rateCode: 'IE_FOOD_9', label: 'VAT Hot Food (Post-Jul 26)', percent: 9.0, validFrom: '2026-07-01', validTo: null, itcAllowed: true, notes: 'Restaurant food from 1-Jul-2026' },
            { id: 'IE_DRINK_23_demo', country: 'IE', rateCode: 'IE_DRINK_23', label: 'VAT Drinks/Alcohol', percent: 23.0, validFrom: '2019-01-01', validTo: null, itcAllowed: true, notes: 'Alcohol & soft drinks' },
            { id: 'IE_COLD_0_demo', country: 'IE', rateCode: 'IE_COLD_0', label: 'VAT Cold Takeaway', percent: 0.0, validFrom: '2019-01-01', validTo: null, itcAllowed: true, notes: 'Chilled food to-go' },
            { id: 'IE_DELIVERY_23_demo', country: 'IE', rateCode: 'IE_DELIVERY_23', label: 'VAT Delivery Services', percent: 23.0, validFrom: '2019-01-01', validTo: null, itcAllowed: true, notes: 'Delivery service charge' },
            { id: 'IE_ACCOM_135_demo', country: 'IE', rateCode: 'IE_ACCOM_135', label: 'VAT Accommodation', percent: 13.5, validFrom: '2019-01-01', validTo: null, itcAllowed: true, notes: 'Hotel rooms' }
          ];
          try { localStorage.setItem(LS.key(c), JSON.stringify(defaultRates)); } catch(e){}
          return defaultRates;
        }
        return [];
      }catch(e){ return []; }
    },
    write:(c,a)=>{ try{ localStorage.setItem(LS.key(c), JSON.stringify(a)); }catch(e){} },
    async list(c){ return LS.read(c); },
    async put(c,id,obj){
      const cleanId = cleanIdForCollection(c, id);
      const a=LS.read(c);
      const rec={...obj,id:cleanId};
      const i=a.findIndex(x=>String(x.id)===String(cleanId));
      if(i>=0)a[i]=rec; else a.push(rec);
      LS.write(c,a);
      return rec;
    },
    async bulkPut(c,arr){
      const a=LS.read(c);
      const cleanedArr = arr.map(o => {
        const cleanId = cleanIdForCollection(c, o.id);
        return { ...o, id: cleanId };
      });
      cleanedArr.forEach(o=>{
        const i=a.findIndex(x=>String(x.id)===String(o.id));
        if(i>=0)a[i]=o; else a.push(o);
      });
      LS.write(c,a);
      return cleanedArr;
    },
    async del(c,id){
      const cleanId = cleanIdForCollection(c, id);
      LS.write(c, LS.read(c).filter(x=>String(x.id)!==String(cleanId)));
      return true;
    },
    async getSettings(){ try{ return JSON.parse(localStorage.getItem(LS.key('settings')))||null; }catch(e){ return null; } },
    async setSettings(o){ try{ localStorage.setItem(LS.key('settings'), JSON.stringify(o)); }catch(e){} return o; }
  };

  /* ---------------- CLOUD (tenant-data) ---------------- */
  // Bridge: the CLOUD methods below call API.select/insert/update/remove.
  // These are provided by RS_API (doppio-api.js). Using a lazy proxy so the
  // reference always points at the current RS_API even if it is replaced later.
  const API = {
    select(...a) { return window.RS_API.select(...a); },
    insert(...a) { return window.RS_API.insert(...a); },
    update(...a) { return window.RS_API.update(...a); },
    upsert(...a) { return window.RS_API.upsert(...a); },
    remove(...a) { return window.RS_API.remove(...a); },
  };

  const SETTINGS_MAP = {
    set_restaurant_name:'business_name', set_outlet_name:'business_name', set_address:'address',
    set_phone:'phone', set_gstin:'gst_number'
  };

  function defaultBusinessName() {
    try {
      const s = window.RS_API && RS_API.session ? RS_API.session() : null;
      const raw = s?.tenant_name || s?.tenant_slug || sessionStorage.getItem('tenant_slug') || 'My Restaurant';
      return String(raw).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    } catch(e) {
      return 'My Restaurant';
    }
  }

  async function ensureBusinessProfile() {
    const body = {
      business_name: defaultBusinessName(),
      address: '',
      phone: '',
      feature_flags: {}
    };
    const res = await API.upsert(conflictTargets.businessProfile.table, body, conflictTargets.businessProfile.onConflict);
    return Array.isArray(res) ? res[0] : res;
  }

  const CLOUD = {
    async list(c){
      const m=MAP[c]; if(!m) return [];
      const rows = await API.select(m.table, { order:m.order||{column:m.pk,ascending:true}, limit:500 });
      known[c] = new Set((rows||[]).map(r=>String(r[m.pk])));
      return (rows||[]).map(m.from);
    },
    async put(c,id,obj){
      const m=MAP[c]; if(!m) return obj;
      const cleanId = cleanIdForCollection(c, id);
      const cleanObj = { ...obj, id: cleanId };
      const body = m.to(cleanObj);
      const isKnown = known[c] && known[c].has(String(cleanId));
      if(isKnown){
        try {
          await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]);
        } catch (err) {
          if (!omitUnsupportedOptionalColumns(c, body, err)) throw err;
          await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]);
        }
        return cleanObj;
      }
      // Only auto-generate a new ID if clientId mode AND the body doesn't already have one
      if(m.clientId && !body[m.pk]) { body[m.pk] = cleanId || newClientId(); }
      // uuidPK tables have a DB-side gen_random_uuid() default and a client-side
      // text id (e.g. "PO-123456") that can't live in a uuid column. Leave the id
      // off the insert so the database generates it; the human-readable code is
      // preserved in a dedicated column (po_number / ticket_number / etc.).
      else if(!body[m.pk] && !m.uuidPK) { body[m.pk] = cleanId; }
      try {
        let res;
        try {
          res = await API.insert(m.table, body);
        } catch (err) {
          if (!omitUnsupportedOptionalColumns(c, body, err)) throw err;
          res = await API.insert(m.table, body);
        }
        const newId = (Array.isArray(res)&&res[0]&&res[0][m.pk]!=null) ? res[0][m.pk] : (body[m.pk]!=null?body[m.pk]:cleanId);
        const cleanNewId = cleanIdForCollection(c, newId);
        if(!known[c]) known[c]=new Set(); known[c].add(String(cleanNewId));
        return { ...obj, id:cleanNewId };
      } catch (err) {
        console.warn(`[RS_DB] Cloud insert failed for ${c}/${cleanId}, attempting update fallback:`, err.message);
        try {
          try {
            await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]);
          } catch (updateErr) {
            if (!omitUnsupportedOptionalColumns(c, body, updateErr)) throw updateErr;
            await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]);
          }
          if(!known[c]) known[c]=new Set(); known[c].add(String(cleanId));
          return cleanObj;
        } catch (updateErr) {
          throw err;
        }
      }
    },
    async bulkPut(c,arr){ for(const o of arr){ await CLOUD.put(c, o.id, o); } return arr; },
    async del(c,id){
      const m=MAP[c]; if(!m) return true;
      const cleanId = cleanIdForCollection(c, id);
      await API.remove(m.table, [{operator:'eq',column:m.pk,value:cleanId}]);
      if(known[c]) known[c].delete(String(cleanId));
      return true;
    },
    async getSettings(){
      let row = await API.select('doppio_business_profile', { maybeSingle:true });
      if(!row) row = await ensureBusinessProfile();
      const out={}; for(const k in SETTINGS_MAP){ if(row[SETTINGS_MAP[k]]!=null) out[k]=row[SETTINGS_MAP[k]]; }
      out.set_gst = row.gst_enabled ? '5%' : '0%';
      
      // Load UI settings from feature_flags.ui_settings
      let flags = {};
      try {
        flags = typeof row.feature_flags === 'string' ? JSON.parse(row.feature_flags) : (row.feature_flags || {});
      } catch(e) {}
      const uiSettings = flags.ui_settings || {};
      for (const k in uiSettings) {
        out[k] = uiSettings[k];
      }
      
      out._raw = row; return out;
    },
    async setSettings(o){
      const body={}; for(const k in o){ if(SETTINGS_MAP[k]) body[SETTINGS_MAP[k]] = o[k]; }
      const existing = await API.select('doppio_business_profile', { maybeSingle:true }).catch(()=>null);
      
      let flags = {};
      if (existing) {
        try {
          flags = typeof existing.feature_flags === 'string' ? JSON.parse(existing.feature_flags) : (existing.feature_flags || {});
        } catch(e) {}
      }
      
      // Store all UI settings in feature_flags.ui_settings
      flags.ui_settings = { ...o };
      // Delete duplicate columns
      for (const k in SETTINGS_MAP) {
        delete flags.ui_settings[k];
      }
      delete flags.ui_settings.set_gst;
      
      body.feature_flags = flags;
      
      // Use upsert on tenant_id to handle both create and update atomically.
      // Previously used insert with a client-generated UUID id, which failed silently
      // because doppio_business_profile.id is bigint GENERATED BY DEFAULT AS IDENTITY.
      await API.upsert(conflictTargets.businessProfile.table, body, conflictTargets.businessProfile.onConflict);
      return o;
    }
  };

  const activeListRequests = {};
  const lastListFetchTime = {};

  const back = () => signedIn() ? CLOUD : LS;
  let cachedSettingsMap = {};

  // Resilient wrapper: if a cloud call throws, log + fall back to local cache so the UI still works.
  async function guard(method, c, ...args){
    if(!signedIn()) return LS[method](c, ...args);
    if(method === 'put' || method === 'bulkPut' || method === 'del') {
      try { await LS[method](c, ...args); } catch(e){}
    }

    if (method === 'getSettings') {
      const tenantId = getActiveTenantId();
      if (cachedSettingsMap[tenantId]) return cachedSettingsMap[tenantId];
      const localData = await LS.getSettings();
      if (localData) {
        cachedSettingsMap[tenantId] = localData;
      }
      
      // Always fetch from cloud on first load (not just when local is empty),
      // so settings saved on another device are picked up immediately.
      if (signedIn()) {
        try {
          const res = await CLOUD.getSettings();
          if (res) {
            cachedSettingsMap[tenantId] = res;
            await LS.setSettings(res);
            lastListFetchTime['settings'] = Date.now();
            return res;
          }
        } catch(e) {
          console.warn(`[RS_DB] initial getSettings sync failed:`, e.message);
        }
      }

      const now = Date.now();
      const lastFetch = lastListFetchTime['settings'] || 0;

      if (!activeListRequests['settings'] && (now - lastFetch > 5000)) {
        activeListRequests['settings'] = (async () => {
          try {
            const res = await CLOUD.getSettings();
            if (res) {
              cachedSettingsMap[tenantId] = res;
              await LS.setSettings(res);
              lastListFetchTime['settings'] = Date.now();
              window.dispatchEvent(new CustomEvent('rs:db-sync', { detail: { collection: 'settings', data: res } }));
              document.dispatchEvent(new Event('rs:tables-updated'));
            }
          } catch(e) {
            console.warn(`[RS_DB] background getSettings sync failed:`, e.message);
          } finally {
            delete activeListRequests['settings'];
          }
        })();
      }
      return localData;
    }

    if (method === 'list') {
      const localData = await LS.list(c, ...args);
      const now = Date.now();
      const lastFetch = lastListFetchTime[c] || 0;

      // Rate limit background sync to once every 5 seconds per collection, and deduplicate concurrent requests
      if (!activeListRequests[c] && (now - lastFetch > 5000)) {
        activeListRequests[c] = (async () => {
          try {
            const res = await CLOUD.list(c, ...args);
            if (res) {
              // Preserve only records that are still queued for upload. Rows
              // that once came from cloud but were deleted elsewhere must not
              // be resurrected from this device's local cache.
              const existing = LS.read(c);
              const cloudIds = new Set(res.map(r => String(r.id)));
              const queuedPutIds = queuedWriteIdsForCollection(c);
              const localOnly = existing.filter(r => {
                if (!r || r.id == null) return false;
                const id = String(cleanIdForCollection(c, r.id));
                return !cloudIds.has(id) && queuedPutIds.has(id);
              });
              const merged = [...res, ...localOnly];
              LS.write(c, merged);
              lastListFetchTime[c] = Date.now();

              // Dispatch database sync event
              window.dispatchEvent(new CustomEvent('rs:db-sync', { detail: { collection: c, data: res } }));

              // Refresh seating grid if drafts, pending_orders, table_sessions or settings changed
              if (c === 'drafts' || c === 'pending_orders' || c === 'table_sessions' || c === 'settings') {
                document.dispatchEvent(new Event('rs:tables-updated'));
              }
            }
          } catch(e) {
            console.warn(`[RS_DB] background list ${c} sync failed:`, e.message);
          } finally {
            delete activeListRequests[c];
          }
        })();
      }
      return localData;
    }

    window.dispatchEvent(new CustomEvent('rs:sync-start', { detail: { method, collection: c } }));
    try {
      const res = await CLOUD[method](c, ...args);
      if (res && (method === 'put' || method === 'bulkPut')) {
        try {
          if (Array.isArray(res)) {
            await LS.bulkPut(c, res);
          } else {
            await LS.put(c, res.id, res);
          }
        } catch(e){}
      }
      window.dispatchEvent(new CustomEvent('rs:sync-done', { detail: { method, collection: c } }));
      return res;
    }
    catch(e){
      console.warn(`[RS_DB] cloud ${method} ${c} failed, using local cache:`, e.message);
      // Schema-cache errors (missing DB column) should NOT trigger a noisy notification --
      // they are resolved by running the migration SQL, not by the user.
      const isSchemaCacheError = e.message && (
        e.message.includes('schema cache') ||
        e.message.includes('Could not find') ||
        e.message.includes('column') ||
        e.message.includes('42703')
      );
      if (!isSchemaCacheError) {
        window.RS_LAST_CLOUD_ERROR = { method, collection:c, message:e.message, time:Date.now() };
        window.dispatchEvent(new CustomEvent('rs:cloud-fallback', { detail:window.RS_LAST_CLOUD_ERROR }));
        // Queue for retry when back online. bulkPut used to be silently
        // dropped here (only put/del were queued) -- bulk menu/recipe
        // imports done while offline would never actually reach the cloud.
        if (method === 'put' || method === 'del' || method === 'bulkPut') {
          addToSyncQueue(method, c, args);
        }
      } else {
        // Log silently -- user needs to run the DB migration
        console.warn(`[RS_DB] Schema mismatch on ${c}: "${e.message}". Run the missing DB migration to fix.`);
      }
      window.dispatchEvent(new CustomEvent('rs:sync-done', { detail: { method, collection: c, error: true } }));
      return LS[method](c, ...args);
    }
  }

  /* ---------------- OFFLINE SYNC QUEUE (retry failed cloud writes on reconnect) ---------------- */
  const SYNC_QUEUE_KEY = 'rs:sync_queue';
  function getSyncQueue() { try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]'); } catch(e){ return []; } }
  function saveSyncQueue(q) { try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)); } catch(e){} }
  function addToSyncQueue(method, collection, args) {
    // 'settings' is a whole-object save (not a per-row collection in MAP),
    // so allow it through explicitly; everything else must be a known collection.
    if (!MAP[collection] && collection !== 'settings') return;
    const q = getSyncQueue();
    // Deduplicate: if same collection+id already queued for put, replace it
    const id = args[0];
    const idx = q.findIndex(x => x.method === method && x.collection === collection && String(x.args[0]) === String(id));
    const entry = { method, collection, args, queuedAt: Date.now() };
    if (idx >= 0) q[idx] = entry; else q.push(entry);
    // Cap queue at 200 entries to prevent localStorage bloat
    if (q.length > 200) q.splice(0, q.length - 200);
    saveSyncQueue(q);
  }
  function queuedWriteIdsForCollection(collection) {
    try {
      const ids = new Set();
      getSyncQueue()
        .filter(entry => entry && entry.collection === collection && (entry.method === 'put' || entry.method === 'bulkPut'))
        .forEach(entry => {
          if (entry.method === 'put') {
            const rawId = entry.args && entry.args[0];
            if (rawId != null) ids.add(String(cleanIdForCollection(collection, rawId)));
          } else {
            // bulkPut queues an array of records as args[0] -- pull each
            // record's own id so none of them look "already deleted" to a
            // background list refresh while still pending upload.
            const rows = (entry.args && Array.isArray(entry.args[0])) ? entry.args[0] : [];
            rows.forEach(row => {
              if (row && row.id != null) ids.add(String(cleanIdForCollection(collection, row.id)));
            });
          }
        });
      return ids;
    } catch(e) {
      return new Set();
    }
  }
  async function drainSyncQueue() {
    if (!signedIn()) return;
    const q = getSyncQueue();
    if (!q.length) return;
    saveSyncQueue([]); // optimistic clear -- failures re-enqueue
    let failed = 0;
    for (const entry of q) {
      try {
        if (entry.method === 'setSettings') {
          // Whole-object save -- CLOUD.setSettings(o) takes only the settings
          // object, not a leading collection name like put/del/bulkPut do.
          await CLOUD.setSettings(entry.args[0]);
        } else {
          await CLOUD[entry.method](entry.collection, ...entry.args);
        }
      } catch(e) {
        console.warn(`[RS_DB] Sync queue replay failed for ${entry.collection}:`, e.message);
        addToSyncQueue(entry.method, entry.collection, entry.args);
        failed++;
      }
    }
    if (failed === 0 && q.length > 0) {
      // Invalidate list cache so UI refreshes with latest cloud data
      for (const entry of q) { delete lastListFetchTime[entry.collection]; }
      window.dispatchEvent(new CustomEvent('rs:sync-queue-drained', { detail: { count: q.length } }));
    }
  }
  // Retry on reconnect
  window.addEventListener('online', () => {
    console.log('[RS_DB] Back online -- draining sync queue');
    setTimeout(drainSyncQueue, 1000); // brief delay for connection to stabilise
  });
  // Also expose for manual call
  window.RS_DB_DRAIN = drainSyncQueue;
  // Drain at boot too, not just on the 'online' event. Without this, anything
  // queued from a previous tab/session (e.g. the browser was closed while
  // offline, or was left signed out) would just sit in localStorage forever
  // -- the 'online' listener only fires on a live offline->online transition,
  // which never happens if the page is loaded fresh while already online.
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    setTimeout(() => { drainSyncQueue().catch(()=>{}); }, 2000);
  }

  /* ---------------- AUTH (delegates to RS_API in cloud) ---------------- */

  /* ---------------- AUTH (delegates to RS_API in cloud) ---------------- */
  const auth = {
    async signUp(p){ if(isCloudConfigured()) return window.RS_API.register(p); throw new Error('Cloud not configured'); },
    async signIn(p){ if(isCloudConfigured()){ const r=await window.RS_API.login(p); if(r.token) localStorage.setItem('rs:session',JSON.stringify(r)); return r; } throw new Error('Cloud not configured'); },
    async signOut(){
      if(isCloudConfigured() && signedIn()){ try{ await window.RS_API.logout(); }catch(e){} }
      for (const k in lastListFetchTime) delete lastListFetchTime[k];
      cachedSettingsMap = {};

      try {
        const tenant = getActiveTenantId();
        localStorage.removeItem('rs_active_cart');
        localStorage.removeItem('rs_active_cart_discount');
        localStorage.removeItem('rs_active_cart_customer');
        localStorage.removeItem('rs_active_order_type');
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const rawKey = localStorage.key(i);
          if (rawKey && rawKey.startsWith(`rs:${tenant}:rs_tab_`)) {
            keysToRemove.push(rawKey);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch(e) {}

      localStorage.removeItem('rs:session');
      return true;
    },
    async session(){ if(window.RS_API) { const s = window.RS_API.session(); if(s) return s; } try{ return JSON.parse(localStorage.getItem('rs:session'))||null; }catch(e){ return null; } }
  };

  window.RS_DB = {
    get mode(){ return mode(); },
    get isCloud(){ return signedIn(); },
    get cloudConfigured(){ return isCloudConfigured(); },
    list:(c)=>guard('list',c),
    listLocal:(c)=>LS.list(c),
    listCloud:(c)=>CLOUD.list(c),
    writeLocal:(c,arr)=>LS.write(c,arr),
    put:(c,id,obj)=>guard('put',c,id,obj),
    bulkPut:(c,arr)=>guard('bulkPut',c,arr),
    del:(c,id)=>guard('del',c,id),
    getSettings:()=>guard('getSettings','settings'),
    setSettings: async (o)=> {
      const tenantId = getActiveTenantId();
      cachedSettingsMap[tenantId] = o;
      await LS.setSettings(o);
      if (signedIn()) {
        try {
          const res = await CLOUD.setSettings(o);
          if (res) {
            cachedSettingsMap[tenantId] = res;
            await LS.setSettings(res);
          }
          return res;
        } catch(e) {
          console.warn('[RS_DB] setSettings cloud failed:', e.message);
          // Queue for retry when back online -- previously a settings save
          // made while offline (or during a flaky connection) was silently
          // dropped: the local copy looked saved, but the cloud never got it
          // and nothing retried later.
          window.RS_LAST_CLOUD_ERROR = { method: 'setSettings', collection: 'settings', message: e.message, time: Date.now() };
          window.dispatchEvent(new CustomEvent('rs:cloud-fallback', { detail: window.RS_LAST_CLOUD_ERROR }));
          addToSyncQueue('setSettings', 'settings', [o]);
          return o;
        }
      }
      return o;
    },
    ...auth
  };
})();
