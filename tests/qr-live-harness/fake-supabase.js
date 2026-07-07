// Minimal in-memory Supabase fake -- implements the query chains used by tenant-public.
'use strict';
const db = {
  saas_tenants: [],
  doppio_menu: [],
  doppio_business_profile: [],
  doppio_pending_orders: [],
  doppio_bills: [],
  doppio_notifications: [],
  public_otp_challenges: [],
  doppio_table_sessions: [],
};
const rateBuckets = {}; // bucket -> {count, resetAt}
let rateLimitsEnforced = true;

function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

class Query {
  constructor(table) {
    this.table = table; this.filters = []; this._order = null; this._limit = null;
    this._single = false; this._countMode = null; this._head = false; this._cols = '*';
    this._op = 'select'; this._payload = null;
  }
  select(cols, opts) { this._cols = cols; if (opts) { this._countMode = opts.count || null; this._head = !!opts.head; } return this; }
  insert(obj) { this._op = 'insert'; this._payload = obj; return this; }
  update(obj) { this._op = 'update'; this._payload = obj; return this; }
  eq(k, v) { this.filters.push(r => String(r[k]) === String(v)); return this; }
  gte(k, v) { this.filters.push(r => String(r[k] || '') >= String(v)); return this; }
  or(_expr) { this._orExpr = _expr; return this; } // only used by get_public_bill; match orderId or id
  order(k, opts) { this._order = { k, asc: !opts || opts.ascending !== false }; return this; }
  limit(n) { this._limit = n; return this; }
  maybeSingle() { this._single = true; return this._run(); }
  _rows() {
    let rows = (db[this.table] || []).filter(r => this.filters.every(f => f(r)));
    if (this._orExpr) {
      const m = [...this._orExpr.matchAll(/(\w+)\.eq\."?([^",]+)"?/g)];
      rows = rows.filter(r => m.some(([, k, v]) => String(r[k]) === String(v)));
    }
    if (this._order) rows = rows.slice().sort((a, b) => this._order.asc ? cmp(String(a[this._order.k]||''), String(b[this._order.k]||'')) : cmp(String(b[this._order.k]||''), String(a[this._order.k]||'')));
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return rows.map(r => ({ ...r }));
  }
  _run() {
    try {
      if (this._op === 'insert') {
        const arr = Array.isArray(this._payload) ? this._payload : [this._payload];
        for (const row of arr) {
          if (this.table === 'doppio_pending_orders' || this.table === 'doppio_notifications') {
            if (row.created_at == null) row.created_at = new Date().toISOString();
          }
          db[this.table].push({ ...row });
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (this._op === 'update') {
        const rows = (db[this.table] || []).filter(r => this.filters.every(f => f(r)));
        rows.forEach(r => Object.assign(r, this._payload));
        return Promise.resolve({ data: null, error: null });
      }
      if (this._countMode) {
        const n = this._rows().length;
        return Promise.resolve({ data: this._head ? null : this._rows(), count: n, error: null });
      }
      const rows = this._rows();
      if (this._single) return Promise.resolve({ data: rows[0] || null, error: null });
      return Promise.resolve({ data: rows, error: null });
    } catch (e) {
      return Promise.resolve({ data: null, error: { message: e.message } });
    }
  }
  then(res, rej) { return this._run().then(res, rej); }
}

function createClient() {
  return {
    from: t => new Query(t),
    rpc: (name, args) => {
      if (name === 'consume_api_rate_limit') {
        if (!rateLimitsEnforced) return Promise.resolve({ data: true, error: null });
        const now = Date.now();
        let b = rateBuckets[args.p_bucket];
        if (!b || now > b.resetAt) { b = rateBuckets[args.p_bucket] = { count: 0, resetAt: now + args.p_window_seconds * 1000 }; }
        b.count += 1;
        return Promise.resolve({ data: b.count <= args.p_limit, error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'unknown rpc ' + name } });
    },
  };
}

module.exports = { db, createClient, rateBuckets, setRateLimits: v => { rateLimitsEnforced = v; } };
