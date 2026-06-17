/* ============================================================
   RestroSuite — Data layer
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
     menu→doppio_menu  bills→doppio_bills  inventory→doppio_inventory
     customers→doppio_crm  employees→doppio_employees  drafts→doppio_draft_orders
     settings→doppio_business_profile
   ============================================================ */
(function(){
  'use strict';
  const API = window.RS_API;
  const cloudConfigured = !!(API && API.configured);
  function signedIn(){ return cloudConfigured && !!API.session(); }
  function mode(){ return signedIn() ? 'cloud' : 'local'; }

  /* ---------------- field mappers (app shape <-> doppio columns) ---------------- */
  const num = v => (v==null||v==='') ? 0 : Number(v);
  const parseItems = t => { try { const a=JSON.parse(t); return Array.isArray(a)?a:[]; } catch(e){ return []; } };

  const MAP = {
    menu: {
      table:'doppio_menu', pk:'id', clientId:true,
      from: r => ({ id:r.id, name:r.name, cat:r.category, price:num(r.price),
                    veg: !(r.recipe_specs && r.recipe_specs.veg===false),
                    stock: r.available===false ? 'out' : 'ok',
                    ingredients: (r.recipe_specs && r.recipe_specs.ingredients) || [] }),
      to: o => ({ name:o.name, category:o.cat, price:num(o.price),
                  available: o.stock!=='out',
                  recipe_specs: { veg: !!o.veg, ingredients: o.ingredients || [] } })
    },
    bills: {
      table:'doppio_bills', pk:'id', clientId:false, order:{column:'created_at',ascending:false},
      from: r => ({ id:r.id, no:r.orderId, time:r.dateTime, table:'—',
                    items: parseItems(r.items).reduce((a,i)=>a+(i.qty||1),0) || parseItems(r.items).length,
                    amount:num(r.total), pay:r.paymentMethod, status:'paid',
                    customerName:r.customerName, customerPhone:r.customerPhone }),
      to: o => ({ orderId:o.no, customerName:o.customerName||'Walk-in Guest', customerPhone:o.customerPhone||null,
                  items: JSON.stringify(o._items||[]), subtotal:num(o.subtotal), gst:num(o.gst),
                  cgst:num(o.cgst), sgst:num(o.sgst), igst:0, total:num(o.amount),
                  paymentMethod:o.pay||'UPI', dateTime:o.time||new Date().toISOString(), transaction_type:'intra' })
    },
    inventory: {
      table:'doppio_inventory', pk:'id', clientId:true,
      from: r => ({ id:r.id, key:r.key, name:r.label||r.name, cat:r.category, stock:num(r.current),
                    unit:r.unit, min:num(r.threshold), max:num(r.max_stock), cost:0 }),
      to: o => ({ key:o.key||String(o.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'),
                  name:o.name, label:o.name, category:o.cat||'General', current:num(o.stock),
                  threshold:num(o.min), max_stock:num(o.max||o.stock), unit:o.unit||'unit' })
    },
    customers: {
      table:'doppio_crm', pk:'id', clientId:false, order:{column:'last_visit',ascending:false},
      from: r => ({ id:r.id, name:r.name, phone:r.phone, visits:num(r.visits), spend:num(r.total_spend),
                    email:r.email, last:r.last_visit, tier:(num(r.total_spend)>25000?'vip':num(r.total_spend)>12000?'gold':'silver') }),
      to: o => ({ name:o.name, phone:o.phone, visits:num(o.visits)||1, total_spend:num(o.spend),
                  email:o.email||'', marketing_opt_in:true })
    },
    employees: {
      table:'doppio_employees', pk:'id', clientId:true,
      from: r => ({ id:r.id, name:r.name, role:r.role, rc:'r-'+String(r.role||'').toLowerCase(),
                    email:r.contact, baseSalary:num(r.baseSalary), shift:r.shift }),
      to: o => ({ name:o.name, role:o.role, contact:o.email||'', baseSalary:num(o.baseSalary), shift:o.shift||'Morning', daily_rate:0 })
    },
    drafts: {
      table:'doppio_draft_orders', pk:'id', clientId:true,
      from: r => ({ id:r.id, draftId:r.draftId, name:r.draftName, customerName:r.customerName, total:num(r.total),
                    items: parseItems(r.items) }),
      to: o => ({ draftId:o.draftId||('D'+Date.now()), draftName:o.name||o.table||'Held order',
                  customerName:o.customerName||'', customerPhone:o.customerPhone||'', paymentMethod:'UPI',
                  items: JSON.stringify(o.items||[]), subtotal:num(o.subtotal), gst:num(o.gst), total:num(o.total) })
    },
    pending_orders: {
      table:'doppio_pending_orders', pk:'id', clientId:false,
      from: r => ({ id:r.id, orderId:r.orderId, customerName:r.customerName, customerPhone:r.customerPhone,
                    items: parseItems(r.items), subtotal:num(r.subtotal), discount:num(r.discount),
                    gst:num(r.gst), total:num(r.total), paymentMethod:r.paymentMethod,
                    orderType:r.orderType, tableNumber:r.tableNumber, status:r.status, dateTime:r.dateTime, priority:r.priority||'normal' }),
      to: o => ({ orderId:o.orderId, customerName:o.customerName||'Guest', customerPhone:o.customerPhone||null,
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
    read:c=>{ try{ return JSON.parse(localStorage.getItem(LS.key(c)))||[]; }catch(e){ return []; } },
    write:(c,a)=>{ try{ localStorage.setItem(LS.key(c), JSON.stringify(a)); }catch(e){} },
    async list(c){ return LS.read(c); },
    async put(c,id,obj){ const a=LS.read(c); const rec={...obj,id}; const i=a.findIndex(x=>String(x.id)===String(id)); if(i>=0)a[i]=rec; else a.push(rec); LS.write(c,a); return rec; },
    async bulkPut(c,arr){ const a=LS.read(c); arr.forEach(o=>{ const i=a.findIndex(x=>String(x.id)===String(o.id)); if(i>=0)a[i]=o; else a.push(o); }); LS.write(c,a); return arr; },
    async del(c,id){ LS.write(c, LS.read(c).filter(x=>String(x.id)!==String(id))); return true; },
    async getSettings(){ try{ return JSON.parse(localStorage.getItem('rs_v2:settings'))||null; }catch(e){ return null; } },
    async setSettings(o){ try{ localStorage.setItem('rs_v2:settings', JSON.stringify(o)); }catch(e){} return o; }
  };

  /* ---------------- CLOUD (tenant-data) ---------------- */
  const SETTINGS_MAP = {
    set_restaurant_name:'business_name', set_outlet_name:'business_name', set_address:'address',
    set_phone:'phone', set_gstin:'gstin', set_gst_state:'gst_state'
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
      const body = m.to(obj);
      const isKnown = known[c] && known[c].has(String(id));
      if(isKnown){ await API.update(m.table, body, [{operator:'eq',column:m.pk,value:id}]); return obj; }
      if(m.clientId){ body[m.pk] = newClientId(); }
      const res = await API.insert(m.table, body);
      const newId = (Array.isArray(res)&&res[0]&&res[0][m.pk]!=null) ? res[0][m.pk] : (body[m.pk]!=null?body[m.pk]:id);
      if(!known[c]) known[c]=new Set(); known[c].add(String(newId));
      return { ...obj, id:newId };
    },
    async bulkPut(c,arr){ for(const o of arr){ await CLOUD.put(c, o.id, o); } return arr; },
    async del(c,id){ const m=MAP[c]; if(!m) return true; await API.remove(m.table, [{operator:'eq',column:m.pk,value:id}]); if(known[c]) known[c].delete(String(id)); return true; },
    async getSettings(){
      const row = await API.select('doppio_business_profile', { maybeSingle:true });
      if(!row) return null;
      const out={}; for(const k in SETTINGS_MAP){ if(row[SETTINGS_MAP[k]]!=null) out[k]=row[SETTINGS_MAP[k]]; }
      out.set_gst = row.gst_enabled ? '5%' : '0%';
      out._raw = row; return out;
    },
    async setSettings(o){
      const body={}; for(const k in o){ if(SETTINGS_MAP[k]) body[SETTINGS_MAP[k]] = o[k]; }
      if(Object.keys(body).length===0) return o;
      const existing = await API.select('doppio_business_profile', { maybeSingle:true }).catch(()=>null);
      if(existing){ await API.update('doppio_business_profile', body, []); }
      else { body.id = newClientId(); await API.insert('doppio_business_profile', body); }
      return o;
    }
  };

  const back = () => signedIn() ? CLOUD : LS;
  // Resilient wrapper: if a cloud call throws, log + fall back to local cache so the UI still works.
  async function guard(method, c, ...args){
    if(!signedIn()) return LS[method](c, ...args);
    try { return await CLOUD[method](c, ...args); }
    catch(e){ console.warn(`[RS_DB] cloud ${method} ${c} failed, using local cache:`, e.message); return LS[method](c, ...args); }
  }

  /* ---------------- AUTH (delegates to RS_API in cloud) ---------------- */
  const auth = {
    async signUp(p){ if(cloudConfigured) return API.register(p); // local demo:
      const a=LS.read('_accounts'); const u={id:'local-'+Date.now(),email:p.email,meta:p.meta||{}}; a.push({...u,password:p.password}); LS.write('_accounts',a); localStorage.setItem('rs:session',JSON.stringify({user:u})); return {user:u}; },
    async signIn(p){ if(cloudConfigured) return API.login(p);
      const u={id:'local-demo',email:p.email||'demo@restrosuite.in',meta:{}}; localStorage.setItem('rs:session',JSON.stringify({user:u})); return {user:u}; },
    async signOut(){ if(API && API.logout) API.logout(); localStorage.removeItem('rs:session'); return true; },
    async session(){ if(API) { const s = API.session(); if(s) return s; } try{ return JSON.parse(localStorage.getItem('rs:session'))||null; }catch(e){ return null; } }
  };

  window.RS_DB = {
    get mode(){ return mode(); },
    get isCloud(){ return signedIn(); },
    cloudConfigured,
    list:(c)=>guard('list',c),
    put:(c,id,obj)=>guard('put',c,id,obj),
    bulkPut:(c,arr)=>guard('bulkPut',c,arr),
    del:(c,id)=>guard('del',c,id),
    getSettings:()=>guard('getSettings','settings'),
    setSettings:(o)=> signedIn()? CLOUD.setSettings(o).catch(e=>{console.warn('[RS_DB] setSettings cloud failed:',e.message);return LS.setSettings(o);}) : LS.setSettings(o),
    ...auth
  };
})();
