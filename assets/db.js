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

  function isCloudConfigured() {
    return !!(window.RS_API && window.RS_API.configured);
  }
  function signedIn(){ return isCloudConfigured() && !!(window.RS_API && window.RS_API.session()); }
  function mode(){ return signedIn() ? 'cloud' : 'local'; }

  function getActiveTenantId() {
    if (isCloudConfigured() && window.RS_API && window.RS_API.session) {
      const s = window.RS_API.session();
      if (s && s.tenant_id) return s.tenant_id;
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
      return stableNumericId(id);
    }
    return id;
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
      from: r => ({ id:r.id, no:r.orderId, time:r.dateTime, table:'--',
                    _items:parseItems(r.items),
                    items: parseItems(r.items).reduce((a,i)=>a+(i.qty||1),0) || parseItems(r.items).length,
                    subtotal:num(r.subtotal), gst:num(r.gst), cgst:num(r.cgst), sgst:num(r.sgst),
                    amount:num(r.total), pay:r.paymentMethod, status:'paid',
                    customerName:r.customerName, customerPhone:r.customerPhone,
                    tenders:parseTenders(r.tenders), change:num(r.change),
                    taxSummary: typeof r.tax_summary === 'string' ? JSON.parse(r.tax_summary) : (r.tax_summary || []),
                    channel: r.channel || 'dine_in',
                    taxProfile: typeof r.tax_profile === 'string' ? JSON.parse(r.tax_profile) : (r.tax_profile || {}),
                    liquorTaxAmount: num(r.liquor_tax_amount),
                    serviceChargeAmount: num(r.service_charge_amount) }),
      to: o => ({ id:o.id, orderId:o.no, customerName:o.customerName||'Walk-in Guest', customerPhone:o.customerPhone||null,
                  items: JSON.stringify(o._items||[]), subtotal:num(o.subtotal), gst:num(o.gst),
                  cgst:num(o.cgst), sgst:num(o.sgst), igst:0, total:num(o.amount),
                  paymentMethod:o.pay||'UPI', dateTime:o.time||new Date().toISOString(), transaction_type:'intra',
                  tenders: Array.isArray(o.tenders) ? JSON.stringify(o.tenders) : o.tenders || '[]',
                  change: num(o.change || 0),
                  tax_summary: Array.isArray(o.taxSummary) ? JSON.stringify(o.taxSummary) : (o.taxSummary ? JSON.stringify([o.taxSummary]) : '[]'),
                  channel: o.channel || 'dine_in',
                  tax_profile: typeof o.taxProfile === 'object' ? JSON.stringify(o.taxProfile) : (o.taxProfile || '{}'),
                  liquor_tax_amount: num(o.liquorTaxAmount),
                  service_charge_amount: num(o.serviceChargeAmount) })
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
                    timestamp:r.timestamp||r.created_at||'', isRead:!!r.isRead, createdAt:r.created_at }),
      to: o => ({ id:o.id, title:o.title||'', message:o.message||'', type:o.type||'info',
                  role:o.role||'all', timestamp:o.timestamp||new Date().toISOString(), isRead:!!o.isRead })
    },
    employees: {
      table:'doppio_employees', pk:'id', clientId:true,
      from: r => ({ id:r.id, name:r.name, role:r.role, rc:'r-'+String(r.role||'').toLowerCase(),
                    email:r.contact, baseSalary:num(r.baseSalary), shift:r.shift }),
      to: o => ({ id:o.id, name:o.name, role:o.role, contact:o.email||'', baseSalary:num(o.baseSalary), shift:o.shift||'Morning', daily_rate:0 })
    },
    drafts: {
      table:'doppio_draft_orders', pk:'id', clientId:true,
      from: r => ({ id:r.id, draftId:r.draftId, name:r.draftName, draftName:r.draftName, customerName:r.customerName, customerPhone:r.customerPhone, total:num(r.total),
                    items: parseItems(r.items) }),
      to: o => ({ id:o.id, draftId:o.draftId||('D'+Date.now()), draftName:o.draftName||o.name||o.table||'Held order',
                  customerName:o.customerName||'', customerPhone:o.customerPhone||'', paymentMethod:'UPI',
                  items: JSON.stringify(o.items||[]), subtotal:num(o.subtotal), gst:num(o.gst), total:num(o.total) })
    },
    pending_orders: {
      table:'doppio_pending_orders', pk:'id', clientId:false,
      from: r => ({ id:r.id, orderId:r.orderId, customerName:r.customerName, customerPhone:r.customerPhone,
                    items: parseItems(r.items), subtotal:num(r.subtotal), discount:num(r.discount),
                    gst:num(r.gst), total:num(r.total), paymentMethod:r.paymentMethod,
                    orderType:r.orderType, tableNumber:r.tableNumber, status:r.status, dateTime:r.dateTime, priority:r.priority||'normal' }),
      to: o => ({ id:o.id, orderId:o.orderId, customerName:o.customerName||'Guest', customerPhone:o.customerPhone||null,
                  items: JSON.stringify(o.items||[]), subtotal:num(o.subtotal), discount:num(o.discount),
                  gst:num(o.gst), total:num(o.total), paymentMethod:o.paymentMethod||'UPI',
                  orderType:o.orderType||'Dine-in', tableNumber:o.tableNumber||'Walk-in',
                  status:o.status||'Pending Review', dateTime:o.dateTime||new Date().toISOString(), priority:o.priority||'normal' })
    },
    shifts: {
      table:'doppio_shifts', pk:'shiftId', clientId:true,
      from: r => ({ shiftId:r.shiftId, cashierName:r.cashierName, openedAt:r.openedAt, closedAt:r.closedAt,
                    openingFloat:num(r.openingFloat), expectedCash:num(r.expectedCash), actualCash:num(r.actualCash),
                    variance:num(r.variance), totalSalesCash:num(r.totalSalesCash), totalSalesUpi:num(r.totalSalesUpi),
                    totalSalesCard:num(r.totalSalesCard), totalPayouts:num(r.totalPayouts), totalSafeDrops:num(r.totalSafeDrops),
                    status:r.status, notes:r.notes }),
      to: o => ({ shiftId:o.shiftId, cashierName:o.cashierName||'', openedAt:o.openedAt, closedAt:o.closedAt||null,
                  openingFloat:num(o.openingFloat), expectedCash:num(o.expectedCash), actualCash:num(o.actualCash),
                  variance:num(o.variance), totalSalesCash:num(o.totalSalesCash), totalSalesUpi:num(o.totalSalesUpi),
                  totalSalesCard:num(o.totalSalesCard), totalPayouts:num(o.totalPayouts), totalSafeDrops:num(o.totalSafeDrops),
                  status:o.status||'OPEN', notes:o.notes||'' })
    },
    shift_events: {
      table:'doppio_shift_events', pk:'eventId', clientId:true,
      from: r => ({ eventId:r.eventId, shiftId:r.shiftId, eventType:r.eventType, amount:num(r.amount), reason:r.reason, createdAt:r.createdAt }),
      to: o => ({ eventId:o.eventId, shiftId:o.shiftId, eventType:o.eventType, amount:num(o.amount), reason:o.reason||'', createdAt:o.createdAt||new Date().toISOString() })
    },
    attendance: {
      table:'doppio_attendance', pk:'id', clientId:true,
      from: r => ({ id:r.id, employeeId:r.employeeId, employeeName:r.employeeName, date:r.date, clockInTime:r.clockInTime, clockOutTime:r.clockOutTime, hoursWorked:num(r.hoursWorked), status:r.status, wages:num(r.wages) }),
      to: o => ({ id:o.id, employeeId:o.employeeId, employeeName:o.employeeName, date:o.date, clockInTime:o.clockInTime, clockOutTime:o.clockOutTime||null, hoursWorked:num(o.hoursWorked), status:o.status||'Completed', wages:num(o.wages) })
    },
    leave_requests: {
      table:'doppio_leave_requests', pk:'id', clientId:true,
      from: r => ({ id:r.id, employeeId:r.employeeId, employeeName:r.employeeName, type:r.type, startDate:r.startDate, endDate:r.endDate, reason:r.reason, status:r.status, days:num(r.days) }),
      to: o => ({ id:o.id, employeeId:o.employeeId, employeeName:o.employeeName, type:o.type, startDate:o.startDate, endDate:o.endDate, reason:o.reason||'', status:o.status||'Pending', days:num(o.days) })
    },
    reservations: {
      table:'doppio_reservations', pk:'id', clientId:true,
      from: r => ({ id:r.id, guestName:r.guestName, guestPhone:r.guestPhone, pax:num(r.pax), tableNumber:r.tableNumber, time:r.time, date:r.date, status:r.status }),
      to: o => ({ id:o.id, guestName:o.guestName, guestPhone:o.guestPhone, pax:num(o.pax), tableNumber:o.tableNumber, time:o.time, date:o.date, status:o.status||'confirmed' })
    },
    offers: {
      table:'doppio_offers', pk:'id', clientId:true,
      from: r => ({ id:r.id, code:r.code, description:r.description, usageCount:num(r.usageCount), status:r.status }),
      to: o => ({ id:o.id, code:o.code, description:o.description||'', usageCount:num(o.usageCount), status:o.status||'active' })
    },
    vendors: {
      table:'doppio_vendors', pk:'id', clientId:true,
      from: r => ({ id:r.id, name:r.name, category:r.category, contact:r.contact, terms:r.terms, rating:num(r.rating), itemsCount:num(r.itemsCount) }),
      to: o => ({ id:o.id, name:o.name, category:o.category||'', contact:o.contact, terms:o.terms||'', rating:num(o.rating), itemsCount:num(o.itemsCount) })
    },
    purchase_orders: {
      table:'doppio_purchase_orders', pk:'id', clientId:true,
      from: r => ({ id:r.id, poNumber:r.poNumber, supplier:r.supplier, items:r.items, value:num(r.value), date:r.date, status:r.status }),
      to: o => ({ id:o.id, poNumber:o.poNumber, supplier:o.supplier, items:o.items||'', value:num(o.value), date:o.date||new Date().toISOString(), status:o.status||'pending' })
    },
    support_tickets: {
      table:'doppio_support_tickets', pk:'id', clientId:true,
      from: r => ({ id:r.id, ticketNumber:r.ticketNumber, subject:r.subject, customerName:r.customerName, priority:r.priority, status:r.status }),
      to: o => ({ id:o.id, ticketNumber:o.ticketNumber, subject:o.subject, customerName:o.customerName, priority:o.priority||'medium', status:o.status||'open' })
    }
  };
  const known = {}; // collection -> Set of ids seen from server
  function newClientId(){ return Date.now()*1000 + Math.floor(Math.random()*1000); }

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
    remove(...a) { return window.RS_API.remove(...a); },
  };

  const SETTINGS_MAP = {
    set_restaurant_name:'business_name', set_outlet_name:'business_name', set_address:'address',
    set_phone:'phone', set_gstin:'gst_number'
  };
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
      if(isKnown){ await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]); return cleanObj; }
      // Only auto-generate a new ID if clientId mode AND the body doesn't already have one
      if(m.clientId && !body[m.pk]) { body[m.pk] = cleanId || newClientId(); }
      else if(!body[m.pk]) { body[m.pk] = cleanId; }
      try {
        const res = await API.insert(m.table, body);
        const newId = (Array.isArray(res)&&res[0]&&res[0][m.pk]!=null) ? res[0][m.pk] : (body[m.pk]!=null?body[m.pk]:cleanId);
        const cleanNewId = cleanIdForCollection(c, newId);
        if(!known[c]) known[c]=new Set(); known[c].add(String(cleanNewId));
        return { ...obj, id:cleanNewId };
      } catch (err) {
        console.warn(`[RS_DB] Cloud insert failed for ${c}/${cleanId}, attempting update fallback:`, err.message);
        try {
          await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]);
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
      const row = await API.select('doppio_business_profile', { maybeSingle:true });
      if(!row) return null;
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
      await API.upsert('doppio_business_profile', body, 'tenant_id');
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
              // SAFE MERGE: preserve locally-created records not yet in cloud
              // (bills/orders written while offline must not be overwritten)
              const existing = LS.read(c);
              const cloudIds = new Set(res.map(r => String(r.id)));
              const localOnly = existing.filter(r => r.id && !cloudIds.has(String(r.id)));
              const merged = [...res, ...localOnly];
              LS.write(c, merged);
              lastListFetchTime[c] = Date.now();

              // Dispatch database sync event
              window.dispatchEvent(new CustomEvent('rs:db-sync', { detail: { collection: c, data: res } }));

              // Refresh seating grid if drafts, pending_orders or settings changed
              if (c === 'drafts' || c === 'pending_orders' || c === 'settings') {
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
        // Queue for retry when back online
        if (method === 'put' || method === 'del') {
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
    if (!MAP[collection]) return; // only queue known collections
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
  async function drainSyncQueue() {
    if (!signedIn()) return;
    const q = getSyncQueue();
    if (!q.length) return;
    saveSyncQueue([]); // optimistic clear -- failures re-enqueue
    let failed = 0;
    for (const entry of q) {
      try {
        await CLOUD[entry.method](entry.collection, ...entry.args);
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

  /* ---------------- AUTH (delegates to RS_API in cloud) ---------------- */

  /* ---------------- AUTH (delegates to RS_API in cloud) ---------------- */
  const auth = {
    async signUp(p){ if(isCloudConfigured()) return window.RS_API.register(p); throw new Error('Cloud not configured'); },
    async signIn(p){ if(isCloudConfigured()){ const r=await window.RS_API.login(p); if(r.token) localStorage.setItem('rs:session',JSON.stringify(r)); return r; } throw new Error('Cloud not configured'); },
    async signOut(){
      if(isCloudConfigured() && signedIn()){ try{ await window.RS_API.logout(); }catch(e){} }
      for (const k in lastListFetchTime) delete lastListFetchTime[k];
      cachedSettingsMap = {};
      cachedSettings = null;

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
   