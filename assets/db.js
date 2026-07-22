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
        // Prefer live tab session (RS_API / sessionStorage). Do NOT fall back to
        // a shared localStorage tenant_id — that is how multi-tab logins used
        // to cross-contaminate carts and offline caches.
        if (window.RS_API && typeof window.RS_API.session === 'function') {
          const s = window.RS_API.session();
          if (s && s.tenant_id) return s.tenant_id;
          if (s && s.tenant_slug) return s.tenant_slug;
        }
        const tid = sessionStorage.getItem('tenant_id');
        if (tid) return tid;
        const slug = sessionStorage.getItem('tenant_slug');
        if (slug) return slug;
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
      if (s && s.role !== 'superadmin' && s.role !== 'brand_admin' && s.tenant_slug) return s.tenant_slug;
    }
    try {
      const tid = sessionStorage.getItem('tenant_id');
      if (tid) return tid;
      const slug = sessionStorage.getItem('tenant_slug');
      if (slug) return slug;
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

  function isUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(id == null ? '' : id)
    );
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
      from: r => {
        const specs = r.recipe_specs && typeof r.recipe_specs === 'object' ? r.recipe_specs : {};
        return {
          id: r.id,
          name: r.name,
          cat: r.category,
          price: num(r.price),
          veg: !(specs && specs.veg === false),
          stock: r.available === false ? 'out' : 'ok',
          ingredients: (specs && specs.ingredients) || [],
          // Recipe quantities are written for this many servings (default 1 plate)
          recipeServings: num(specs.recipeServings != null ? specs.recipeServings : specs.servings) || 1,
          serveUnit: specs.serveUnit || specs.serve_unit || 'plate',
          taxCategory: r.tax_category || 'IN_REST_5',
          bestseller: !!(r.bestseller || specs.bestseller),
          isSpecial: !!(specs.isSpecial || specs.special),
          isStaple: !!(specs.isStaple || specs.staple),
          pairWater: specs.pairWater,
          addons: Array.isArray(specs.addons) ? specs.addons : [],
          orderCount: num(specs.orderCount) || 0,
          recipePending: !!specs.recipePending,
          description: r.description || specs.description || '',
          nameHi: specs.nameHi || specs.name_hi || '',
          descriptionHi: specs.descriptionHi || specs.description_hi || '',
        };
      },
      to: o => ({
        id: o.id,
        name: o.name,
        category: o.cat,
        price: num(o.price),
        available: o.stock !== 'out',
        bestseller: !!o.bestseller,
        description: o.description || '',
        recipe_specs: {
          veg: !!o.veg,
          ingredients: (o.ingredients || []).map((g) => ({
            name: g.name,
            qty: num(g.qty),
            unit: g.unit || 'unit',
            key: g.key || undefined,
          })),
          recipeServings: Math.max(1, num(o.recipeServings != null ? o.recipeServings : o.servings) || 1),
          serveUnit: o.serveUnit || o.serve_unit || 'plate',
          isSpecial: !!o.isSpecial,
          isStaple: !!o.isStaple,
          bestseller: !!o.bestseller,
          pairWater: o.pairWater,
          addons: Array.isArray(o.addons) ? o.addons : [],
          orderCount: num(o.orderCount) || 0,
          recipePending: !!o.recipePending,
          description: o.description || '',
          nameHi: o.nameHi || o.name_hi || '',
          descriptionHi: o.descriptionHi || o.description_hi || '',
        },
        tax_category: o.taxCategory || 'IN_REST_5',
      })
    },
    bills: {
      table:'doppio_bills', pk:'id', clientId:false, order:{column:'created_at',ascending:false},
      from: r => {
        const taxProfile = typeof r.tax_profile === 'string' ? (()=>{ try { return JSON.parse(r.tax_profile); } catch(e){ return {}; } })() : (r.tax_profile || {});
        // Competitive packs store tip/promo/covers/etc in tax_profile._ops (no new columns/tables).
        const ops = (taxProfile && taxProfile._ops) || {};
        return {
          id:r.id, no:r.order_id, time:r.date_time, table:(r.table_number||'--'), dateTime:r.created_at,
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
          taxProfile,
          liquorTaxAmount: num(r.liquor_tax_amount),
          serviceChargeAmount: num(r.service_charge_amount),
          tipAmount: num(ops.tipAmount),
          deliveryCharge: num(ops.deliveryCharge),
          promoCode: ops.promoCode || '',
          promoAmount: num(ops.promoAmount),
          promoTitle: ops.promoTitle || '',
          promoOfferId: ops.promoOfferId || null,
          covers: num(ops.covers),
          pax: num(ops.covers),
          loyaltyRedeemAmount: num(ops.loyaltyRedeemAmount),
          loyaltyPointsUsed: num(ops.loyaltyPointsUsed),
          stationId: ops.stationId || '',
          stationLabel: ops.stationLabel || '',
          cashier: ops.cashier || '',
          shiftId: ops.shiftId || r.shift_id || '',
          disc: num(ops.disc != null ? ops.disc : r.discount),
        };
      },
      to: o => {
        const statusRaw = String(o.status || 'paid').toLowerCase();
        const status = statusRaw === 'refunded' ? 'refunded' : 'paid';
        const orderType = o.orderType || o.channel || 'dine_in';
        const tableNum = o.table && o.table !== '--' ? String(o.table) : null;
        let taxProfile = {};
        try {
          taxProfile = typeof o.taxProfile === 'object' && o.taxProfile
            ? { ...o.taxProfile }
            : (typeof o.taxProfile === 'string' ? JSON.parse(o.taxProfile || '{}') : {});
        } catch (_) { taxProfile = {}; }
        taxProfile._ops = {
          tipAmount: num(o.tipAmount),
          deliveryCharge: num(o.deliveryCharge),
          promoCode: o.promoCode || '',
          promoAmount: num(o.promoAmount),
          promoTitle: o.promoTitle || '',
          promoOfferId: o.promoOfferId || null,
          covers: num(o.covers != null ? o.covers : o.pax),
          loyaltyRedeemAmount: num(o.loyaltyRedeemAmount),
          loyaltyPointsUsed: num(o.loyaltyPointsUsed),
          stationId: o.stationId || '',
          stationLabel: o.stationLabel || '',
          cashier: o.cashier || '',
          shiftId: o.shiftId || '',
          disc: num(o.disc != null ? o.disc : o.discount),
        };
        const body = {
          // Prefer natural key order_id for upsert; omit hashed client id when
          // possible so Postgres identity can allocate a stable PK.
          order_id: String(o.no || o.orderId || o.id || ''),
          customer_name: o.customerName || 'Walk-in Guest',
          customer_phone: o.customerPhone || null,
          items: JSON.stringify(o._items || []),
          subtotal: num(o.subtotal),
          gst: num(o.gst),
          cgst: num(o.cgst),
          sgst: num(o.sgst),
          igst: 0,
          total: num(o.amount != null ? o.amount : o.total),
          payment_method: o.pay || o.paymentMethod || 'UPI',
          date_time: o.dateTime || o.time || new Date().toISOString(),
          transaction_type: 'intra',
          tenders: Array.isArray(o.tenders) ? JSON.stringify(o.tenders) : (o.tenders || '[]'),
          change: num(o.change || o.changeAmount || 0),
          tax_summary: Array.isArray(o.taxSummary) ? JSON.stringify(o.taxSummary) : (o.taxSummary ? JSON.stringify([o.taxSummary]) : '[]'),
          channel: o.channel || 'dine_in',
          tax_profile: JSON.stringify(taxProfile),
          liquor_tax_amount: num(o.liquorTaxAmount),
          service_charge_amount: num(o.serviceChargeAmount),
          status,
          refund_reason: o.refundReason || '',
          refunded_at: o.refundedAt || null,
          table_number: tableNum,
          order_type: String(orderType),
        };
        if (o.idempotencyKey || o.idempotency_key) {
          body.idempotency_key = String(o.idempotencyKey || o.idempotency_key);
        }
        // Only send id when it is already a real cloud bigint (not a hash of "RS-…")
        if (o.id != null && Number.isFinite(Number(o.id)) && Number(o.id) < 9e15 && String(o.id).length < 16) {
          // Keep id for updates of already-synced rows; upsert ignores it on conflict order_id
          if (known.bills && known.bills.has(String(o.id))) {
            body.id = Number(o.id);
          }
        }
        return body;
      }
    },
    tax_rates: {
      // Live table is a shared catalog: country_code / effective_from (no tenant_id).
      // tenant-data treats doppio_tax_rates as GLOBAL_TABLES for select/write.
      table:'doppio_tax_rates', pk:'id', clientId:true,
      from: r => ({ id:r.id,
                    country: r.country || r.country_code || 'IN',
                    rateCode: r.rate_code,
                    label: r.label,
                    percent: num(r.percent),
                    validFrom: r.valid_from || r.effective_from || null,
                    validTo: r.valid_to || r.effective_to || null,
                    itcAllowed: !!r.itc_allowed,
                    notes: r.notes || '' }),
      to: o => ({ id: o.id,
                  country_code: o.country || 'IN',
                  rate_code: o.rateCode,
                  label: o.label,
                  percent: num(o.percent),
                  effective_from: o.validFrom || new Date().toISOString().slice(0, 10),
                  itc_allowed: !!o.itcAllowed,
                  notes: o.notes || '' })
    },
    inventory: {
      table:'doppio_inventory', pk:'id', clientId:true,
      from: r => ({
        id: r.id,
        key: r.key,
        name: r.label || r.name,
        cat: r.category,
        stock: num(r.current),
        unit: r.unit,
        min: num(r.threshold),
        max: num(r.max_stock),
        // unit_cost is optional (added via align migrations / client optional columns)
        cost: num(r.unit_cost != null ? r.unit_cost : r.cost),
        supplier: r.supplier || r.vendor || '',
      }),
      to: o => ({
        id: o.id,
        key: o.key || String(o.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: o.name,
        label: o.name,
        category: o.cat || 'General',
        current: num(o.stock),
        threshold: num(o.min),
        max_stock: num(o.max || o.stock),
        unit: o.unit || 'unit',
        unit_cost: num(o.cost),
        supplier: o.supplier || '',
      }),
    },
    customers: {
      table:'doppio_crm', pk:'id', clientId:false, order:{column:'last_visit',ascending:false},
      from: r => {
        const spend = num(r.total_spend);
        return {
          id: r.id,
          name: r.name,
          phone: r.phone,
          visits: num(r.visits),
          spend,
          email: r.email || '',
          last: r.last_visit,
          dues: num(r.dues),
          notes: r.notes || '',
          marketingOptIn: r.marketing_opt_in !== false,
          tier: spend > 10000 ? 'vip' : spend > 5000 ? 'gold' : 'silver',
        };
      },
      to: o => {
        // National mobile only — strip country codes so +353 85… and 85… store the same
        let digits = String(o.phone || '').replace(/\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        if (digits.startsWith('353')) digits = digits.slice(3);
        else if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(2);
        else if (digits.startsWith('44') && digits.length >= 12) digits = digits.slice(2);
        if (digits.startsWith('0') && digits.length >= 9) digits = digits.slice(1);
        const phone = digits || String(o.phone || '').trim();
        const body = {
          name: o.name,
          phone,
          visits: num(o.visits) || 0,
          total_spend: num(o.spend),
          email: o.email || '',
          dues: num(o.dues),
          marketing_opt_in: o.marketingOptIn !== false && o.marketing_opt_in !== false,
        };
        // Only ISO / parseable dates for last_visit (avoid "Jul 13, 11:18 AM" parse noise)
        if (o.last) {
          const t = Date.parse(o.last);
          if (!Number.isNaN(t)) body.last_visit = new Date(t).toISOString();
        }
        if (o.id != null && (/^[0-9a-f-]{36}$/i.test(String(o.id)) || Number.isFinite(Number(o.id)))) {
          body.id = o.id;
        }
        return body;
      },
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
      from: r => {
        const role = r.role || r.role_key || 'staff';
        const roleKey = String(r.role_key || r.roleKey || role).toLowerCase().replace(/\s+/g, '_');
        const pay = num(r.payroll != null ? r.payroll : r.base_salary != null ? r.base_salary : r.baseSalary);
        const phone = r.phone || r.contact || '';
        const leaves = r.leaves && typeof r.leaves === 'object' ? r.leaves : {};
        return {
          id: r.id,
          name: r.name,
          role: typeof role === 'string' && role.length < 40 ? role : roleKey,
          roleKey,
          rc: 'r-' + roleKey,
          email: r.email || r.contact || '',
          phone: phone,
          whatsapp: r.whatsapp || phone,
          baseSalary: pay,
          payroll: pay > 0 ? String(pay) : '',
          shift: r.shift || 'Day',
          pin: r.pin || '',
          leaves: leaves,
          casualLeave: num(leaves.casual != null ? leaves.casual : leaves.casualLeave) || 12,
          sickLeave: num(leaves.sick != null ? leaves.sick : leaves.sickLeave) || 6,
          earnedLeave: num(leaves.earned != null ? leaves.earned : leaves.earnedLeave) || 15,
          status: r.status || 'active',
          staffUserId: r.staff_user_id || r.staffUserId || null,
        };
      },
      to: o => {
        const pay = num(o.baseSalary != null ? o.baseSalary : String(o.payroll || '').replace(/[^0-9.]/g, ''));
        const leaves = Object.assign(
          { casual: 12, sick: 6, earned: 15 },
          o.leaves && typeof o.leaves === 'object' ? o.leaves : {},
          {
            casual: num(o.casualLeave != null ? o.casualLeave : (o.leaves && o.leaves.casual)) || 12,
            sick: num(o.sickLeave != null ? o.sickLeave : (o.leaves && o.leaves.sick)) || 6,
            earned: num(o.earnedLeave != null ? o.earnedLeave : (o.leaves && o.leaves.earned)) || 15,
          }
        );
        return {
          id: o.id,
          name: o.name,
          role: o.role || o.roleKey || 'staff',
          role_key: o.roleKey || String(o.role || 'staff').toLowerCase(),
          contact: o.email || o.phone || '',
          phone: o.phone || o.whatsapp || '',
          base_salary: pay,
          payroll: pay,
          shift: o.shift || 'Day',
          leaves,
          status: o.status || 'active',
          daily_rate: 0,
        };
      },
    },
    salary_advances: {
      table: 'doppio_salary_advances', pk: 'id', clientId: true,
      from: r => ({
        id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
        amount: num(r.amount), remaining: num(r.remaining != null ? r.remaining : r.amount),
        recover: r.recover || 'next_payroll', note: r.note || '',
        status: r.status || 'paid', paidAt: r.paid_at || r.created_at,
      }),
      to: o => ({
        id: o.id, employee_id: o.employeeId, employee_name: o.employeeName || '',
        amount: num(o.amount), remaining: num(o.remaining != null ? o.remaining : o.amount),
        recover: o.recover || 'next_payroll', note: o.note || '',
        status: o.status || 'paid', paid_at: o.paidAt || new Date().toISOString(),
      }),
    },
    salary_payments: {
      table: 'doppio_salary_payments', pk: 'id', clientId: true,
      from: r => ({
        id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, month: r.month,
        base: num(r.base), advanceDeducted: num(r.advance_deducted), net: num(r.net),
        paidAt: r.paid_at,
      }),
      to: o => ({
        id: o.id, employee_id: o.employeeId, employee_name: o.employeeName || '',
        month: o.month || '', base: num(o.base), advance_deducted: num(o.advanceDeducted),
        net: num(o.net), paid_at: o.paidAt || new Date().toISOString(),
      }),
    },
    commission_partners: {
      table: 'doppio_commission_partners', pk: 'id', clientId: true,
      from: r => ({
        id: r.id, name: r.name, phone: r.phone || '',
        type: r.rate_type || r.type || 'percent', rate: num(r.rate),
        active: r.active !== false, notes: r.notes || '',
      }),
      to: o => ({
        id: o.id, name: o.name, phone: o.phone || '',
        rate_type: o.type || o.rate_type || 'percent', rate: num(o.rate),
        active: o.active !== false, notes: o.notes || '',
      }),
    },
    commission_events: {
      table: 'doppio_commission_events', pk: 'id', clientId: true,
      from: r => ({
        id: r.id, partnerId: r.partner_id, partnerName: r.partner_name,
        billNo: r.bill_no, billGrand: num(r.bill_grand), commission: num(r.commission),
        customer: r.customer || '', paidOut: !!r.paid_out, at: r.at || r.created_at,
      }),
      to: o => ({
        id: o.id, partner_id: o.partnerId, partner_name: o.partnerName || '',
        bill_no: o.billNo || '', bill_grand: num(o.billGrand), commission: num(o.commission),
        customer: o.customer || '', paid_out: !!o.paidOut, at: o.at || new Date().toISOString(),
      }),
    },
    commission_payouts: {
      table: 'doppio_commission_payouts', pk: 'id', clientId: true,
      from: r => ({
        id: r.id, partnerId: r.partner_id, partnerName: r.partner_name,
        amount: num(r.amount), period: r.period || 'monthly', paidAt: r.paid_at,
      }),
      to: o => ({
        id: o.id, partner_id: o.partnerId, partner_name: o.partnerName || '',
        amount: num(o.amount), period: o.period || 'monthly',
        paid_at: o.paidAt || new Date().toISOString(),
      }),
    },
    owner_report_prefs: {
      table: 'doppio_owner_report_prefs', pk: 'tenant_id', clientId: false,
      from: r => ({
        id: r.tenant_id, tenantId: r.tenant_id, enabled: r.enabled !== false,
        ownerPhone: r.owner_phone || '', dailySales: r.daily_sales !== false,
        dailySalesHour: num(r.daily_sales_hour) || 22, stockAlerts: r.stock_alerts !== false,
        stockAlertHour: num(r.stock_alert_hour) || 10, weeklyPL: r.weekly_pl !== false,
        weeklyPLDay: num(r.weekly_pl_day) || 1, monthlyPL: r.monthly_pl !== false,
        monthlyPLDay: num(r.monthly_pl_day) || 1,
      }),
      to: o => ({
        tenant_id: o.tenantId || o.id,
        enabled: o.enabled !== false, owner_phone: o.ownerPhone || '',
        daily_sales: o.dailySales !== false, daily_sales_hour: num(o.dailySalesHour) || 22,
        stock_alerts: o.stockAlerts !== false, stock_alert_hour: num(o.stockAlertHour) || 10,
        weekly_pl: o.weeklyPL !== false, weekly_pl_day: num(o.weeklyPLDay) || 1,
        monthly_pl: o.monthlyPL !== false, monthly_pl_day: num(o.monthlyPLDay) || 1,
        updated_at: new Date().toISOString(),
      }),
    },
    drafts: {
      table:'doppio_draft_orders', pk:'id', clientId:true,
      from: r => ({ id:r.id, draftId:r.draft_id, name:r.draft_name, draftName:r.draft_name, customerName:r.customer_name, customerPhone:r.customer_phone, total:num(r.total),
                    items: parseItems(r.items) }),
      to: o => ({
        id: cleanIdForCollection('drafts', o.id != null ? o.id : Date.now()),
        draft_id: o.draftId || fallbackLogicalCode('D'),
        draft_name: o.draftName || o.name || o.table || 'Held order',
        customer_name: o.customerName || '',
        customer_phone: o.customerPhone || '',
        payment_method: o.paymentMethod || 'UPI',
        items: typeof o.items === 'string' ? o.items : JSON.stringify(o.items || []),
        subtotal: num(o.subtotal),
        gst: num(o.gst),
        total: num(o.total),
      })
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
      // UUID PK with DB default — leave id empty on insert so gen_random_uuid() runs.
      // clientId:false + missing uuidPK used to send id:null and cloud insert failed silently.
      table:'doppio_table_sessions', pk:'id', clientId:false, uuidPK:true,
      from: r => ({ id:r.id, tableNumber:r.table_number, token:r.session_token, status:r.status, createdAt:r.created_at, closedAt:r.closed_at, lastOrderAt:r.last_order_at }),
      to: o => {
        const row = {
          table_number: o.tableNumber,
          session_token: o.token,
          status: o.status,
          created_at: o.createdAt,
          closed_at: o.closedAt || null,
          last_order_at: o.lastOrderAt || null,
        };
        if (o.id != null) row.id = o.id;
        return row;
      }
    },
    shifts: {
      table:'doppio_shifts', pk:'shift_id', clientId:true,
      from: r => {
        // Cash movements packed into notes as JSON (existing text column — no new table).
        let notes = r.notes || '';
        let cashMovements = [];
        let totalPayIns = 0;
        let stationId = '';
        let stationLabel = '';
        let zScope = '';
        try {
          const parsed = notes && String(notes).trim().startsWith('{') ? JSON.parse(notes) : null;
          if (parsed && typeof parsed === 'object') {
            cashMovements = Array.isArray(parsed.cashMovements) ? parsed.cashMovements : [];
            totalPayIns = num(parsed.totalPayIns);
            stationId = parsed.stationId || '';
            stationLabel = parsed.stationLabel || '';
            zScope = parsed.zScope || '';
            notes = parsed.note || parsed.notes || '';
          }
        } catch (_) {}
        return {
          shiftId:r.shift_id, cashierName:r.cashier_name, openedAt:r.opened_at, closedAt:r.closed_at,
          openingFloat:num(r.opening_float), expectedCash:num(r.expected_cash), actualCash:num(r.actual_cash),
          variance:num(r.variance), totalSalesCash:num(r.total_sales_cash), totalSalesUpi:num(r.total_sales_upi),
          totalSalesCard:num(r.total_sales_card), totalPayouts:num(r.total_payouts), totalSafeDrops:num(r.total_safe_drops),
          totalPayIns, cashMovements, stationId, stationLabel, zScope,
          status:r.status, notes,
        };
      },
      to: o => {
        const payIns = num(o.totalPayIns);
        const moves = Array.isArray(o.cashMovements) ? o.cashMovements : [];
        const notesPayload = {
          note: o.notes || '',
          cashMovements: moves,
          totalPayIns: payIns,
          stationId: o.stationId || '',
          stationLabel: o.stationLabel || '',
          zScope: o.zScope || '',
        };
        return {
          shift_id:o.shiftId, cashier_name:o.cashierName||'', opened_at:o.openedAt, closed_at:o.closedAt||null,
          opening_float:num(o.openingFloat), expected_cash:num(o.expectedCash), actual_cash:num(o.actualCash),
          variance:num(o.variance), total_sales_cash:num(o.totalSalesCash), total_sales_upi:num(o.totalSalesUpi),
          total_sales_card:num(o.totalSalesCard), total_payouts:num(o.totalPayouts), total_safe_drops:num(o.totalSafeDrops),
          status:o.status||'OPEN', notes: JSON.stringify(notesPayload),
        };
      }
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
      from: r => {
        const start = r.start_date || r.startDate || r.from || '';
        const end = r.end_date || r.endDate || r.to || start;
        const st = String(r.status || 'Pending');
        return {
          id: r.id,
          employeeId: r.employee_id || r.employeeId,
          employeeName: r.employee_name || r.employeeName,
          type: r.type || 'casual',
          startDate: start,
          endDate: end,
          from: start,
          to: end,
          reason: r.reason || '',
          status: st.toLowerCase() === 'pending' ? 'pending' : st.toLowerCase() === 'approved' ? 'approved' : st.toLowerCase() === 'rejected' ? 'rejected' : st,
          days: num(r.days) || 1,
          createdAt: r.created_at || r.createdAt,
        };
      },
      to: o => {
        const start = o.startDate || o.from;
        const end = o.endDate || o.to || start;
        let days = num(o.days);
        if (!days && start && end) {
          try {
            days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
          } catch (_) { days = 1; }
        }
        const stRaw = String(o.status || 'pending').toLowerCase();
        const status =
          stRaw === 'approved' ? 'Approved' : stRaw === 'rejected' ? 'Rejected' : 'Pending';
        return {
          id: o.id,
          employee_id: o.employeeId,
          employee_name: o.employeeName,
          type: o.type || 'Casual',
          start_date: start,
          end_date: end,
          reason: o.reason || '',
          status,
          days: days || 1,
        };
      },
    },
    reservations: {
      table:'doppio_reservations', pk:'id', clientId:false, uuidPK:true,
      from: r => {
        const reserved = r.reserved_for || '';
        let time = r.notes || '';
        // Prefer clock time from reserved_for when notes empty/stale
        if ((!time || !/^\d{1,2}:\d{2}/.test(String(time))) && reserved) {
          try {
            const d = new Date(reserved);
            if (!isNaN(d.getTime())) {
              time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
            }
          } catch (e) {}
        }
        return {
          id: r.id,
          guestName: r.guest_name,
          guestPhone: r.phone,
          pax: num(r.party_size),
          tableNumber: r.table_number,
          time,
          date: String(reserved).slice(0, 10),
          status: r.status,
          reserved_for: reserved || null,
        };
      },
      to: o => {
        let reserved = o.reserved_for || null;
        if (!reserved && o.date) {
          try {
            let t = String(o.time || '19:30').trim();
            if (/^\d{2}:\d{2}$/.test(t)) t += ':00';
            const d = new Date(o.date + 'T' + t);
            if (!isNaN(d.getTime())) reserved = d.toISOString();
          } catch (e) {}
        }
        if (!reserved) reserved = new Date().toISOString();
        const timeNote = String(o.time || '').replace(/:\d{2}$/, '').slice(0, 5) || '';
        return {
          guest_name: o.guestName || 'Guest',
          phone: o.guestPhone || null,
          party_size: num(o.pax) || 2,
          table_number: o.tableNumber || '',
          reserved_for: reserved,
          notes: timeNote || o.notes || '',
          status: o.status || 'confirmed',
        };
      },
    },
    offers: {
      table:'doppio_offers', pk:'id', clientId:false, uuidPK:true,
      from: r => {
        const dtype = String(r.discount_type || 'percent').toLowerCase();
        const dval = num(r.discount_value);
        const pct = dtype === 'amount' ? 0 : dval;
        const fixed = dtype === 'amount' ? dval : 0;
        return {
          id: r.id,
          code: r.code,
          title: r.title,
          description: r.title,
          pct,
          fixed,
          discount_pct: pct,
          amount: fixed,
          usageCount: num(r.usage_count),
          status: r.status,
          expiresAt: r.ends_at || null,
          expires_at: r.ends_at || null,
          startsAt: r.starts_at || null,
        };
      },
      to: o => {
        const fixed = num(o.fixed != null ? o.fixed : o.amount);
        const pct = num(o.pct != null ? o.pct : o.discount_pct);
        return {
          code: o.code || '',
          title: o.title || o.description || o.code || 'Offer',
          discount_type: fixed > 0 ? 'amount' : 'percent',
          discount_value: fixed > 0 ? fixed : pct,
          ends_at: o.expiresAt || o.expires_at || null,
          starts_at: o.startsAt || o.starts_at || null,
          usage_count: num(o.usageCount),
          status: o.status || 'active',
        };
      }
    },
    vendors: {
      table: 'doppio_vendors',
      pk: 'id',
      clientId: false,
      uuidPK: true,
      from: (r) => ({
        id: r.id,
        name: r.name,
        category: r.category || 'General',
        cat: r.category || 'General',
        contact: r.phone || r.email || '',
        email: r.email || '',
        terms: r.terms || 'Net 30',
        rating: num(r.rating) || 4,
        itemsCount: num(r.items_count),
        items: num(r.items_count),
      }),
      // Core schema: name, phone, email, category, status (extra cols dropped gracefully if absent)
      to: (o) => ({
        name: o.name,
        category: o.category || o.cat || 'General',
        phone: o.contact || o.phone || '',
        email: o.email || '',
        status: o.status || 'active',
        terms: o.terms || 'Net 30',
        rating: num(o.rating) || 4,
        items_count: num(o.itemsCount != null ? o.itemsCount : o.items),
      }),
    },
    purchase_orders: {
      table: 'doppio_purchase_orders',
      pk: 'id',
      clientId: false,
      uuidPK: true,
      from: (r) => ({
        id: r.id,
        poNumber: r.po_number,
        supplier: r.vendor_name,
        items: r.item_name,
        value: num(r.expected_cost),
        date: r.due_date || r.created_at,
        status: r.status,
        lines: r.lines || null,
        quantity: num(r.quantity),
        unit: r.unit || 'unit',
      }),
      to: (o) => ({
        po_number: o.poNumber || o.po || '',
        vendor_name: o.supplier || 'Supplier',
        item_name: o.items || 'Supply items',
        quantity: num(
          o.quantity != null
            ? o.quantity
            : Array.isArray(o.lines)
              ? o.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0)
              : 0
        ),
        unit:
          (Array.isArray(o.lines) && o.lines[0] && o.lines[0].unit) || o.unit || 'unit',
        expected_cost: num(o.value),
        due_date: (o.date || new Date().toISOString()).slice(0, 10),
        status: o.status || 'pending',
      }),
    },
    // Waste is local-first (no dedicated cloud table in all deploys). HYBRID falls back to LS.
    waste_log: {
      table: null,
      pk: 'id',
      clientId: true,
      localOnly: true,
    },
    // Batches with expiry — prefer local; cloud table doppio_inventory_batches when available
    inventory_batches: {
      table: 'doppio_inventory_batches',
      pk: 'id',
      clientId: false,
      // Composite PK on server is (tenant_id, id) with text id
      from: (r) => ({
        id: r.id,
        invId: r.inv_id || r.invId || null,
        ingredientKey: r.ingredient_key || r.ingredientKey || '',
        ingredientName: r.ingredient_name || r.ingredientName || r.label || '',
        qty: num(r.qty != null ? r.qty : r.quantity),
        unit: r.unit || 'unit',
        expiryDate: r.expiryDate || r.expiry_date || null,
        receivedDate: r.receivedDate || r.received_date || null,
        source: r.source || 'receive',
        poId: r.po_id || r.poId || null,
        cost: num(r.cost),
        createdAt: r.created_at || r.createdAt || null,
      }),
      to: (o) => ({
        id: o.id,
        ingredient_key: o.ingredientKey || o.ingredient_key || '',
        qty: num(o.qty),
        expiryDate: o.expiryDate || o.expiry_date || null,
        receivedDate: o.receivedDate || o.received_date || null,
      }),
    },
    support_tickets: {
      table:'doppio_support_tickets', pk:'id', clientId:false, uuidPK:true,
      from: r => ({
        id: r.id,
        ticketNumber: r.ticket_number,
        subject: r.subject,
        customerName: r.customer_name,
        priority: r.priority,
        status: r.status,
        notes: r.last_message || r.notes || '',
        createdAt: r.created_at || null,
      }),
      to: o => ({
        ticket_number: o.ticketNumber || '',
        subject: o.subject || '',
        customer_name: o.customerName || '',
        priority: o.priority || 'medium',
        status: o.status || 'open',
        last_message: o.notes || o.last_message || '',
      })
    },
    // Local-first growth tools (no dedicated cloud table on all deploys)
    broadcasts: {
      table: null,
      pk: 'id',
      clientId: true,
      localOnly: true,
    },
    // Guest + staff reviews — cloud when doppio_guest_reviews exists
    reviews: {
      table: 'doppio_guest_reviews',
      pk: 'id',
      clientId: false,
      uuidPK: true,
      order: { column: 'created_at', ascending: false },
      from: (r) => ({
        id: r.id,
        guestName: r.guest_name || r.guestName || 'Guest',
        rating: num(r.rating) || 5,
        comment: r.comment || '',
        source: r.source || 'staff',
        tableNumber: r.table_number || r.tableNumber || '',
        billNo: r.bill_no || r.billNo || '',
        createdAt: r.created_at || r.createdAt || null,
        status: r.status || (r.homepage_approved ? 'approved' : 'pending'),
        homepageApproved: !!(r.homepage_approved || r.homepageApproved),
      }),
      to: (o) => ({
        guest_name: o.guestName || o.guest_name || 'Guest',
        rating: Math.max(1, Math.min(5, num(o.rating) || 5)),
        comment: o.comment || '',
        source: o.source || 'staff',
        table_number: o.tableNumber || o.table_number || null,
        bill_no: o.billNo || o.bill_no || null,
        status: o.status || (o.homepageApproved ? 'approved' : 'pending'),
        homepage_approved: !!(o.homepageApproved || o.homepage_approved),
      }),
    },
  };
  const conflictTargets = Object.freeze({
    businessProfile: { table: 'doppio_business_profile', onConflict: 'tenant_id' },
    menu: { table: 'doppio_menu', onConflict: 'tenant_id,name' },
    recipeCosting: { table: 'doppio_custom_recipes', onConflict: 'tenant_id,item_name' },
    bills: { table: 'doppio_bills', onConflict: 'tenant_id,order_id' },
    billSql: 'ON CONFLICT (tenant_id, order_id) DO UPDATE SET'
  });
  const optionalCloudColumns = Object.freeze({
    menu: ['tax_category'],
    bills: ['idempotency_key', 'cgst', 'sgst', 'igst', 'tax_summary', 'tax_profile', 'channel', 'liquor_tax_amount', 'service_charge_amount', 'transaction_type'],
    reviews: ['status', 'homepage_approved'],
    // These persist once migration 20260709160000_crm_customer_fields is
    // applied; until then a DB without the columns will drop them gracefully
    // instead of rejecting the whole customer upsert.
    customers: ['email', 'dues', 'marketing_opt_in'],
    // unit_cost / supplier may be missing on older doppio_inventory schemas
    inventory: ['unit_cost', 'supplier', 'cost'],
    vendors: ['terms', 'rating', 'items_count', 'email'],
    inventory_batches: ['ingredient_name', 'unit', 'source', 'po_id', 'cost', 'inv_id', 'receivedDate', 'expiryDate'],
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
    async list(c, _opts){ return LS.read(c); },
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
    async list(c, opts){
      const m=MAP[c]; if(!m) return [];
      // Collections without a cloud table (e.g. waste_log) stay localStorage-backed
      if (m.localOnly || !m.table) return LS.list(c, opts);
      const options = opts && typeof opts === 'object' ? opts : {};
      // Higher default for money/CRM collections (Wave 2 pagination)
      const defaultLimit = (c === 'bills' || c === 'customers') ? 1000 : 500;
      const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
        ? Math.min(Number(options.limit), 2000)
        : defaultLimit;
      const offset = Number.isFinite(Number(options.offset)) && Number(options.offset) > 0
        ? Number(options.offset)
        : 0;
      const rows = await API.select(m.table, {
        order: options.order || m.order || { column: m.pk, ascending: true },
        limit,
        offset: offset || null,
      });
      known[c] = new Set((rows||[]).map(r=>String(r[m.pk])));
      // Preserve client-only fields (e.g. unit cost) that older cloud schemas omit
      const mapped = (rows || []).map(m.from);
      if (c === 'inventory') {
        const local = LS.read(c) || [];
        mapped.forEach((row) => {
          const loc = local.find(
            (x) =>
              String(x.id) === String(row.id) ||
              String(x.key || '') === String(row.key || '') ||
              String(x.name || '').toLowerCase() === String(row.name || '').toLowerCase()
          );
          if (loc) {
            if (!(Number(row.cost) > 0) && Number(loc.cost) > 0) row.cost = Number(loc.cost);
            if (!row.supplier && loc.supplier) row.supplier = loc.supplier;
          }
        });
      }
      return mapped;
    },
    async put(c,id,obj){
      const m=MAP[c]; if(!m) return obj;
      if (m.localOnly || !m.table) return LS.put(c, id, obj);
      let cleanId = cleanIdForCollection(c, id);
      // uuid PK tables: never send logical codes (RES-… / TKT-… / OFF-…) as id —
      // Postgres uuid columns reject them. Leave id empty so gen_random_uuid() runs.
      if (m.uuidPK && cleanId != null && !isUuid(cleanId)) cleanId = null;
      // pending_orders uses bigint IDENTITY. Client strings (cart_… / seat_…) hash to
      // synthetic numbers that fail or collide. Leave id empty and keep order_id.
      const pendingLogical =
        c === 'pending_orders' &&
        id != null &&
        !Number.isFinite(Number(id));
      if (pendingLogical) cleanId = null;
      const cleanObj = { ...obj, id: cleanId != null ? cleanId : (pendingLogical ? undefined : obj.id) };
      if (m.uuidPK && !isUuid(cleanObj.id)) delete cleanObj.id;
      if (pendingLogical) delete cleanObj.id;
      const body = m.to(cleanObj);
      if (m.uuidPK && body && body[m.pk] != null && !isUuid(body[m.pk])) delete body[m.pk];
      if (pendingLogical) {
        delete body.id;
        if (!body.order_id) body.order_id = String(obj.orderId || id);
      }

      // Bills: upsert on (tenant_id, order_id) — multi-device safe, no hash PK races
      if (c === 'bills' && body.order_id) {
        try {
          const upsertBody = { ...body };
          // Let identity allocate id when not a known cloud row
          if (upsertBody.id == null) delete upsertBody.id;
          let res;
          try {
            res = await API.upsert(m.table, upsertBody, 'tenant_id,order_id', { returning: true, columns: '*' });
          } catch (err) {
            if (!omitUnsupportedOptionalColumns(c, upsertBody, err)) throw err;
            res = await API.upsert(m.table, upsertBody, 'tenant_id,order_id', { returning: true, columns: '*' });
          }
          const row = Array.isArray(res) ? res[0] : res;
          const newId = row && row.id != null ? row.id : cleanId;
          if (!known[c]) known[c] = new Set();
          known[c].add(String(newId));
          return { ...obj, id: newId, no: (row && (row.order_id || row.orderId)) || obj.no || body.order_id };
        } catch (err) {
          console.warn('[RS_DB] Bill upsert failed, falling back to insert/update:', err.message);
          // fall through to generic path
        }
      }

      const isKnown = !!(cleanId != null && known[c] && known[c].has(String(cleanId)) && (!m.uuidPK || isUuid(cleanId)));
      if(isKnown){
        try {
          await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]);
        } catch (err) {
          if (!omitUnsupportedOptionalColumns(c, body, err)) throw err;
          await API.update(m.table, body, [{operator:'eq',column:m.pk,value:cleanId}]);
        }
        return { ...obj, ...cleanObj, id: cleanId };
      }
      // pending_orders: if we already have this order_id in cloud, update by order_id
      if (c === 'pending_orders' && body.order_id) {
        try {
          const existing = await API.select(m.table, {
            filters: [{ operator: 'eq', column: 'order_id', value: body.order_id }],
            limit: 1,
          }).catch(() => null);
          const ex = Array.isArray(existing) && existing[0] ? existing[0] : null;
          if (ex && ex.id != null) {
            const upd = { ...body };
            delete upd.id;
            try {
              await API.update(m.table, upd, [{ operator: 'eq', column: 'id', value: ex.id }]);
            } catch (err) {
              if (!omitUnsupportedOptionalColumns(c, upd, err)) throw err;
              await API.update(m.table, upd, [{ operator: 'eq', column: 'id', value: ex.id }]);
            }
            if (!known[c]) known[c] = new Set();
            known[c].add(String(ex.id));
            return { ...obj, id: ex.id, orderId: body.order_id };
          }
        } catch (e) {
          console.warn('[RS_DB] pending_orders order_id lookup failed', e && e.message);
        }
      }
      // Only auto-generate a new ID if clientId mode AND the body doesn't already have one
      if(m.clientId && !body[m.pk]) { body[m.pk] = cleanId || newClientId(); }
      // uuidPK tables have a DB-side gen_random_uuid() default and a client-side
      // text id (e.g. "PO-123456") that can't live in a uuid column. Leave the id
      // off the insert so the database generates it; the human-readable code is
      // preserved in a dedicated column (po_number / ticket_number / etc.).
      else if (c === 'pending_orders' || c === 'bills') {
        // bigint identity — never force a client hash id on insert
        if (body.id == null || pendingLogical) delete body.id;
      }
      else if(!body[m.pk] && !m.uuidPK && c !== 'bills') { body[m.pk] = cleanId; }
      else if (c === 'bills' && body.id == null) { /* leave id for identity */ }
      else if(!body[m.pk] && !m.uuidPK) { body[m.pk] = cleanId; }
      if (m.uuidPK && body[m.pk] != null && !isUuid(body[m.pk])) delete body[m.pk];
      try {
        let res;
        try {
          res = await API.insert(m.table, body);
        } catch (err) {
          // Unique on order_id → update that row instead of hashing client id
          const msg = String(err && err.message || '');
          if ((c === 'bills' || c === 'pending_orders') && body.order_id && /duplicate|unique|order_id/i.test(msg)) {
            await API.update(m.table, body, [{ operator: 'eq', column: 'order_id', value: body.order_id }]);
            const rows = await API.select(m.table, {
              filters: [{ operator: 'eq', column: 'order_id', value: body.order_id }],
              limit: 1,
            }).catch(() => null);
            const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
            const newId = row && row.id != null ? row.id : cleanId;
            if (!known[c]) known[c] = new Set();
            if (newId != null) known[c].add(String(newId));
            return { ...obj, id: newId, orderId: body.order_id };
          }
          // Offers unique (tenant_id, code) → update existing code instead of failing
          if (c === 'offers' && body.code && /duplicate|unique|code/i.test(msg)) {
            await API.update(m.table, body, [{ operator: 'eq', column: 'code', value: body.code }]);
            const rows = await API.select(m.table, {
              filters: [{ operator: 'eq', column: 'code', value: body.code }],
              limit: 1,
            }).catch(() => null);
            const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
            const newId = row && row.id != null ? row.id : cleanId;
            if (newId != null && (!m.uuidPK || isUuid(newId))) {
              if (!known[c]) known[c] = new Set();
              known[c].add(String(newId));
            }
            return { ...obj, id: newId, code: body.code };
          }
          if (!omitUnsupportedOptionalColumns(c, body, err)) throw err;
          res = await API.insert(m.table, body);
        }
        const newId = (Array.isArray(res)&&res[0]&&res[0][m.pk]!=null) ? res[0][m.pk] : (body[m.pk]!=null?body[m.pk]:cleanId);
        const cleanNewId = cleanIdForCollection(c, newId);
        if (cleanNewId != null && (!m.uuidPK || isUuid(cleanNewId))) {
          if(!known[c]) known[c]=new Set(); known[c].add(String(cleanNewId));
        }
        return { ...obj, id:cleanNewId };
      } catch (err) {
        console.warn(`[RS_DB] Cloud insert failed for ${c}/${cleanId}, attempting update fallback:`, err.message);
        try {
          if (c === 'bills' && body.order_id) {
            await API.update(m.table, body, [{ operator: 'eq', column: 'order_id', value: body.order_id }]);
            return { ...obj, id: cleanId };
          }
          // Don't try update-by-id for non-uuid ids on uuid tables (would never match)
          if (m.uuidPK && !isUuid(cleanId)) throw err;
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
      if (m.localOnly || !m.table) return LS.del(c, id);
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
      
      // Store UI settings in feature_flags.ui_settings — never embed _raw or functions
      // (spreading getSettings() used to nest the full business profile and break upserts)
      const ui = {};
      if (o && typeof o === 'object') {
        Object.keys(o).forEach((k) => {
          if (k === '_raw' || k === 'feature_flags') return;
          if (typeof o[k] === 'function') return;
          try {
            // Ensure JSON-serializable (custom_tables, etc.)
            JSON.stringify(o[k]);
            ui[k] = o[k];
          } catch (_) {}
        });
      }
      flags.ui_settings = ui;
      // Delete duplicate columns that live on the profile row itself
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

      // Instant paint from local cache; background cloud refresh (deduped, 2.5s min gap)
      if (!activeListRequests[c] && (now - lastFetch > 2500)) {
        activeListRequests[c] = (async () => {
          try {
            const res = await CLOUD.list(c, ...args);
            if (res) {
              // Preserve only records that are still queued for upload. Rows
              // that once came from cloud but were deleted elsewhere must not
              // be resurrected from this device's local cache.
              const existing = LS.read(c);
              const cloudIds = new Set(res.map(r => String(r.id)));
              const cloudOrderIds = new Set(
                res.map((r) => String(r.orderId || r.order_id || '')).filter(Boolean)
              );
              const queuedPutIds = queuedWriteIdsForCollection(c);
              const localOnly = existing.filter(r => {
                if (!r || r.id == null) return false;
                const id = String(cleanIdForCollection(c, r.id));
                if (cloudIds.has(id)) return false;
                if (queuedPutIds.has(id) || queuedPutIds.has(String(r.id))) return true;
                // Keep recent cart/seat floor tickets so Dining doesn't flash back
                // to Available while cloud insert is in flight or offline.
                if (c === 'pending_orders') {
                  const oid = String(r.orderId || r.id || '');
                  if (cloudOrderIds.has(oid)) return false;
                  const st = String(r.status || '');
                  const isFloor =
                    r.source === 'pos_cart' ||
                    r.source === 'floor_seat' ||
                    oid.indexOf('cart_') === 0 ||
                    oid.indexOf('seat_') === 0 ||
                    st === 'DineIn Active';
                  if (!isFloor) return false;
                  const ts = Date.parse(r.dateTime || r.createdAt || '') || 0;
                  return !ts || Date.now() - ts < 15 * 60 * 1000;
                }
                return false;
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
      // Always surface + queue money-critical collections. Schema errors still
      // queue bills so nothing is silently lost; admin can fix migration later.
      const isMoneyCritical = (c === 'bills' || c === 'inventory' || c === 'customers');
      window.RS_LAST_CLOUD_ERROR = { method, collection:c, message:e.message, time:Date.now(), schema: !!isSchemaCacheError };
      window.dispatchEvent(new CustomEvent('rs:cloud-fallback', { detail:window.RS_LAST_CLOUD_ERROR }));
      if (method === 'put' || method === 'del' || method === 'bulkPut') {
        if (!isSchemaCacheError || isMoneyCritical) {
          addToSyncQueue(method, c, args);
        }
      }
      if (isSchemaCacheError) {
        console.warn(`[RS_DB] Schema mismatch on ${c}: "${e.message}". Run the missing DB migration to fix.`);
      }
      window.dispatchEvent(new CustomEvent('rs:sync-done', { detail: { method, collection: c, error: true } }));
      return LS[method](c, ...args);
    }
  }

  /* ---------------- OFFLINE SYNC QUEUE (IndexedDB primary, localStorage mirror) ---------------- */
  const SYNC_QUEUE_KEY = 'rs:sync_queue';
  const SYNC_IDB_NAME = 'rs_sync_queue_v1';
  const SYNC_IDB_STORE = 'queue';
  const MONEY_COLLECTIONS = new Set(['bills', 'inventory', 'customers', 'drafts', 'pending_orders']);
  let drainInFlight = false;
  let _syncQueueMem = null; // in-memory cache (source of truth after boot)
  let _idbReady = null;

  function openSyncIdb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (_idbReady) return _idbReady;
    _idbReady = new Promise((resolve) => {
      try {
        const req = indexedDB.open(SYNC_IDB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(SYNC_IDB_STORE)) {
            db.createObjectStore(SYNC_IDB_STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return _idbReady;
  }

  async function idbLoadAll() {
    const db = await openSyncIdb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(SYNC_IDB_STORE, 'readonly');
        const store = tx.objectStore(SYNC_IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function idbReplaceAll(entries) {
    const db = await openSyncIdb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(SYNC_IDB_STORE, 'readwrite');
        const store = tx.objectStore(SYNC_IDB_STORE);
        store.clear();
        (entries || []).forEach((e) => {
          if (e && e.id) store.put(e);
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  function loadSyncQueueSync() {
    if (_syncQueueMem) return _syncQueueMem;
    try {
      _syncQueueMem = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
      if (!Array.isArray(_syncQueueMem)) _syncQueueMem = [];
    } catch (e) {
      _syncQueueMem = [];
    }
    return _syncQueueMem;
  }

  function getSyncQueue() {
    return loadSyncQueueSync().slice();
  }

  function saveSyncQueue(q) {
    _syncQueueMem = Array.isArray(q) ? q.slice() : [];
    // Mirror to localStorage (small critical backup; may truncate non-critical if huge)
    try {
      const mirror = _syncQueueMem.length > 80
        ? _syncQueueMem.filter((e) => e && e.critical).concat(_syncQueueMem.filter((e) => e && !e.critical).slice(-40))
        : _syncQueueMem;
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(mirror));
    } catch (e) {
      try {
        // last resort: bills only
        const billsOnly = _syncQueueMem.filter((e) => e && e.collection === 'bills');
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(billsOnly.slice(-50)));
      } catch (_) {}
    }
    // Durable primary store
    idbReplaceAll(_syncQueueMem).catch(() => {});
  }

  // Boot: prefer IndexedDB contents if present, else migrate localStorage → IDB
  (async function migrateSyncQueueToIdb() {
    try {
      const fromIdb = await idbLoadAll();
      if (fromIdb && fromIdb.length) {
        _syncQueueMem = fromIdb;
        // refresh LS mirror
        try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(fromIdb.slice(0, 80))); } catch (_) {}
      } else {
        const fromLs = loadSyncQueueSync();
        if (fromLs.length) await idbReplaceAll(fromLs);
      }
      if (typeof window !== 'undefined' && window.RS_DB_NOTIFY_SYNC) {
        try { window.RS_DB_NOTIFY_SYNC(); } catch (_) {}
      }
    } catch (e) {
      console.warn('[RS_DB] sync queue IDB migrate failed', e);
    }
  })();
  function entryKey(method, collection, args) {
    const id = args && args[0];
    if (method === 'bulkPut' && Array.isArray(id)) {
      return method + '|' + collection + '|' + id.map(r => r && r.id).join(',');
    }
    return method + '|' + collection + '|' + String(id);
  }
  function notifySyncQueue() {
    const q = getSyncQueue();
    const pending = q.filter(e => e && e.status !== 'acked');
    const billPending = pending.filter(e => e.collection === 'bills').length;
    window.__rsSyncQueueDepth = pending.length;
    window.__rsSyncBillPending = billPending;
    window.dispatchEvent(new CustomEvent('rs:sync-queue-changed', {
      detail: { depth: pending.length, bills: billPending, entries: pending.slice(0, 20) }
    }));
    try {
      let badge = document.getElementById('rs-sync-queue-badge');
      if (!badge) {
        const host = document.querySelector('.topbar-right, .topbar-actions, #topbar-right, .topbar');
        if (host) {
          badge = document.createElement('button');
          badge.id = 'rs-sync-queue-badge';
          badge.type = 'button';
          badge.title = 'Pending cloud sync — click to retry';
          badge.style.cssText = 'display:none;align-items:center;gap:6px;border:1px solid rgba(234,179,8,.4);background:rgba(234,179,8,.12);color:var(--text,#16151c);border-radius:999px;padding:5px 10px;font-size:11.5px;font-weight:700;cursor:pointer';
          host.insertBefore(badge, host.firstChild);
          badge.onclick = () => {
            drainSyncQueue().then(() => {
              if (window.RS && RS.toast) RS.toast('Retrying pending sync…', 'fa-cloud-arrow-up');
            }).catch(() => {});
          };
        }
      }
      if (badge) {
        if (pending.length > 0) {
          badge.style.display = 'inline-flex';
          badge.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> ' +
            (billPending ? (billPending + ' bill' + (billPending === 1 ? '' : 's') + ' pending') : (pending.length + ' pending'));
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (_) {}
  }
  function addToSyncQueue(method, collection, args) {
    // 'settings' is a whole-object save (not a per-row collection in MAP),
    // so allow it through explicitly; everything else must be a known collection.
    if (!MAP[collection] && collection !== 'settings') return;
    const q = getSyncQueue();
    const key = entryKey(method, collection, args);
    const idx = q.findIndex(x => entryKey(x.method, x.collection, x.args) === key);
    const entry = {
      id: (idx >= 0 && q[idx].id) ? q[idx].id : ('sq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      method,
      collection,
      args,
      queuedAt: Date.now(),
      status: 'pending',
      attempts: (idx >= 0 && q[idx].attempts) ? q[idx].attempts : 0,
      critical: MONEY_COLLECTIONS.has(collection) || collection === 'settings',
    };
    if (idx >= 0) q[idx] = entry; else q.push(entry);

    // Cap non-critical at 180; NEVER drop bills/inventory/customers
    if (q.length > 220) {
      const dropIdx = q.findIndex(e => e && !e.critical && e.status !== 'in_progress');
      if (dropIdx >= 0) q.splice(dropIdx, 1);
      else {
        // All critical — drop oldest non-bill non-in_progress if still over hard cap
        const soft = q.findIndex(e => e && e.collection !== 'bills' && e.status !== 'in_progress');
        if (soft >= 0 && q.length > 300) q.splice(soft, 1);
      }
    }
    saveSyncQueue(q);
    notifySyncQueue();
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
  function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error((label || 'sync') + ' timed out after ' + ms + 'ms')), ms);
      }),
    ]);
  }

  async function drainSyncQueue(opts) {
    if (!signedIn()) return { ok: 0, failed: 0, remaining: getSyncQueue().length };
    if (drainInFlight) return { ok: 0, failed: 0, remaining: getSyncQueue().length, busy: true };
    drainInFlight = true;
    const forceDropStuck = !!(opts && opts.forceDropStuck);
    try {
      let q = getSyncQueue().filter(e => e && e.status !== 'acked');
      if (!q.length) {
        notifySyncQueue();
        window.dispatchEvent(new CustomEvent('rs:sync-queue-drained', { detail: { count: 0, failed: 0 } }));
        return { ok: 0, failed: 0, remaining: 0 };
      }

      // Mark all pending as in_progress and persist BEFORE attempting
      // (crash mid-drain must not lose the queue — old code cleared first)
      q = q.map(e => ({ ...e, status: e.status === 'in_progress' ? 'in_progress' : 'pending' }));
      saveSyncQueue(q);
      notifySyncQueue();

      let ok = 0;
      let failed = 0;
      const remaining = [];
      for (const entry of q) {
        const attempts = (entry.attempts || 0) + 1;
        const working = { ...entry, status: 'in_progress', attempts };
        // Persist in_progress state for this entry
        const snap = getSyncQueue().map(e =>
          (e.id === working.id || entryKey(e.method, e.collection, e.args) === entryKey(working.method, working.collection, working.args))
            ? working : e
        );
        saveSyncQueue(snap);

        try {
          // Hard timeout so one hung network call cannot leave the blue banner forever
          if (entry.method === 'setSettings') {
            await withTimeout(CLOUD.setSettings(entry.args[0]), 20000, 'setSettings');
          } else if (typeof CLOUD[entry.method] === 'function') {
            await withTimeout(CLOUD[entry.method](entry.collection, ...entry.args), 20000, entry.method + ':' + entry.collection);
          } else {
            throw new Error('Unknown sync method: ' + entry.method);
          }
          ok++;
          // Remove only this entry on success
          const after = getSyncQueue().filter(e =>
            !(e.id === working.id || entryKey(e.method, e.collection, e.args) === entryKey(working.method, working.collection, working.args))
          );
          saveSyncQueue(after);
        } catch (e) {
          const msg = (e && e.message) || String(e);
          console.warn(`[RS_DB] Sync queue replay failed for ${entry.collection}:`, msg);
          failed++;
          // Drop poison pills: permanent client errors, or too many retries for non-bill rows
          const permanent = /401|403|404|not signed|unauthorized|invalid|schema|column|duplicate key/i.test(msg);
          const maxAttempts = entry.critical ? 12 : 6;
          if (forceDropStuck || permanent || attempts >= maxAttempts) {
            console.warn(`[RS_DB] Dropping stuck sync entry ${entry.method}/${entry.collection} after ${attempts} attempt(s): ${msg}`);
            const after = getSyncQueue().filter(x =>
              !(x.id === working.id || entryKey(x.method, x.collection, x.args) === entryKey(working.method, working.collection, working.args))
            );
            saveSyncQueue(after);
            continue;
          }
          remaining.push({
            ...working,
            status: 'pending',
            lastError: msg,
            lastAttemptAt: Date.now(),
          });
          // Write failed entry back as pending
          const cur = getSyncQueue();
          const ix = cur.findIndex(x =>
            x.id === working.id || entryKey(x.method, x.collection, x.args) === entryKey(working.method, working.collection, working.args)
          );
          if (ix >= 0) cur[ix] = remaining[remaining.length - 1];
          else cur.push(remaining[remaining.length - 1]);
          saveSyncQueue(cur);
        }
      }

      const left = getSyncQueue().filter(e => e && e.status !== 'acked').length;
      if (ok > 0) {
        for (const entry of q) { delete lastListFetchTime[entry.collection]; }
      }
      window.dispatchEvent(new CustomEvent('rs:sync-queue-drained', { detail: { count: ok, failed, remaining: left } }));
      notifySyncQueue();
      return { ok, failed, remaining: left };
    } finally {
      drainInFlight = false;
    }
  }
  // Retry on reconnect
  window.addEventListener('online', () => {
    console.log('[RS_DB] Back online -- draining sync queue');
    setTimeout(() => { drainSyncQueue().catch(() => {}); }, 1000); // brief delay for connection to stabilise
  });
  // Also expose for manual call (banner Retry + console)
  window.RS_DB_DRAIN = drainSyncQueue;
  window.RS_DB_FLUSH_SYNC = drainSyncQueue;
  window.RS_DB_SYNC_DEPTH = () => getSyncQueue().filter(e => e && e.status !== 'acked').length;
  window.RS_DB_GET_SYNC_QUEUE = () => getSyncQueue().filter(e => e && e.status !== 'acked');
  window.RS_DB_CLEAR_SYNC_QUEUE = () => {
    saveSyncQueue([]);
    notifySyncQueue();
    window.dispatchEvent(new CustomEvent('rs:sync-queue-drained', { detail: { count: 0, failed: 0, remaining: 0, cleared: true } }));
  };
  window.RS_DB_NOTIFY_SYNC = notifySyncQueue;
  // Drain at boot too, not just on the 'online' event. Without this, anything
  // queued from a previous tab/session (e.g. the browser was closed while
  // offline, or was left signed out) would just sit in localStorage forever
  // -- the 'online' listener only fires on a live offline->online transition,
  // which never happens if the page is loaded fresh while already online.
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    setTimeout(() => { drainSyncQueue().catch(()=>{}); notifySyncQueue(); }, 2000);
  }
  // Paint badge after DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(notifySyncQueue, 500));
    else setTimeout(notifySyncQueue, 800);
  }

  /* ---------------- AUTH (delegates to RS_API in cloud) ---------------- */

  /* ---------------- AUTH (delegates to RS_API in cloud) ---------------- */
  const auth = {
    async signUp(p){ if(isCloudConfigured()) return window.RS_API.register(p); throw new Error('Cloud not configured'); },
    async signIn(p){ if(isCloudConfigured()){ const r=await window.RS_API.login(p); if(r.token) localStorage.setItem('rs:session',JSON.stringify(r)); return r; } throw new Error('Cloud not configured'); },
    async signOut(){
      // Always clear auth, even if cloud looks "not configured" momentarily —
      // otherwise keep-me-signed-in rehydrates and login auto-resumes.
      try {
        if (window.RS_API && typeof window.RS_API.logout === 'function') {
          await window.RS_API.logout();
        }
      } catch (e) {}
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

      try { localStorage.removeItem('rs:session'); } catch (e) {}
      try { sessionStorage.clear(); } catch (e) {}
      return true;
    },
    async session(){ if(window.RS_API) { const s = window.RS_API.session(); if(s) return s; } try{ return JSON.parse(localStorage.getItem('rs:session'))||null; }catch(e){ return null; } }
  };

  function cachePinHashFromSettings(settings) {
    try {
      if (settings && settings.admin_pin_hash) {
        localStorage.setItem('rs:admin_pin_hash', String(settings.admin_pin_hash));
      }
    } catch (_) {}
  }

  window.RS_DB = {
    get mode(){ return mode(); },
    get isCloud(){ return signedIn(); },
    get cloudConfigured(){ return isCloudConfigured(); },
    list:(c, opts)=>guard('list',c, opts),
    listLocal:(c)=>LS.list(c),
    listCloud:(c, opts)=>CLOUD.list(c, opts),
    writeLocal:(c,arr)=>LS.write(c,arr),
    put:(c,id,obj)=>guard('put',c,id,obj),
    bulkPut:(c,arr)=>guard('bulkPut',c,arr),
    del:(c,id)=>guard('del',c,id),
    /** Drain offline write queue (banner Retry calls this). */
    flushSyncQueue: (opts) => drainSyncQueue(opts),
    drainSyncQueue: (opts) => drainSyncQueue(opts),
    getSyncQueueDepth: () => getSyncQueue().filter(e => e && e.status !== 'acked').length,
    clearSyncQueue: () => {
      saveSyncQueue([]);
      notifySyncQueue();
      window.dispatchEvent(new CustomEvent('rs:sync-queue-drained', { detail: { count: 0, failed: 0, remaining: 0, cleared: true } }));
    },
    getSettings: async ()=>{
      const s = await guard('getSettings','settings');
      cachePinHashFromSettings(s);
      return s;
    },
    setSettings: async (o)=> {
      const tenantId = getActiveTenantId();
      cachedSettingsMap[tenantId] = o;
      cachePinHashFromSettings(o);
      await LS.setSettings(o);
      if (signedIn()) {
        try {
          const res = await withTimeout(CLOUD.setSettings(o), 20000, 'setSettings');
          if (res) {
            cachedSettingsMap[tenantId] = res;
            cachePinHashFromSettings(res);
            await LS.setSettings(res);
          }
          // Settings reached cloud — drop any prior failed settings queue entries
          try {
            const cleaned = getSyncQueue().filter(e => !(e && e.method === 'setSettings'));
            if (cleaned.length !== getSyncQueue().length) {
              saveSyncQueue(cleaned);
              notifySyncQueue();
            }
          } catch (_) {}
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
