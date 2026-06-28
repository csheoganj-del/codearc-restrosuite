/**
 * aggregators.js -- Swiggy / Zomato online order integration
 *
 * Responsibilities:
 *  - Poll aggregator APIs for new orders
 *  - Normalise platform-specific payloads into a common order format
 *  - Accept / reject / update order status
 *  - Persist orders to doppio_online_orders via tenant-data Edge Function
 *
 * Usage:
 *   const ag = RestroSuite.aggregators.create({ db, tenantId });
 *   await ag.poll();                     // fetch new orders from all enabled platforms
 *   await ag.accept(orderId);
 *   await ag.reject(orderId, reason);
 *   await ag.markReady(orderId);
 *   ag.subscribe(callback);              // real-time UI updates
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.aggregators = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // -- Constants ----------------------------------------------------------------

  const PLATFORMS = { SWIGGY: "swiggy", ZOMATO: "zomato", CUSTOM: "custom" };

  const STATUS = {
    NEW:        "new",
    ACCEPTED:   "accepted",
    PREPARING:  "preparing",
    READY:      "ready",
    PICKED_UP:  "picked_up",
    DELIVERED:  "delivered",
    CANCELLED:  "cancelled"
  };

  // -- Normalizers (platform payload -> common order shape) ----------------------

  /**
   * Swiggy Partner API response -> common order.
   * Docs: https://partner.swiggy.com/docs (requires approved partner access)
   */
  function normalizeSwiggy(raw) {
    const items = (raw.order_items || []).map((i) => ({
      name:     i.name,
      quantity: Number(i.quantity) || 1,
      price:    Number(i.price) || 0,
      addons:   (i.addons || []).map((a) => ({ name: a.name, price: Number(a.price) || 0 }))
    }));
    return {
      platform:          PLATFORMS.SWIGGY,
      platform_order_id: String(raw.order_id || raw.id),
      status:            STATUS.NEW,
      customer_name:     raw.delivery_address?.name || raw.customer_name || "",
      customer_phone:    raw.customer_phone || "",
      items,
      subtotal:          Number(raw.order_total)    || 0,
      tax:               Number(raw.tax_amount)     || 0,
      delivery_charge:   Number(raw.delivery_charges) || 0,
      discount:          Number(raw.discount)       || 0,
      total:             Number(raw.net_total || raw.order_total) || 0,
      delivery_address:  raw.delivery_address || null,
      estimated_pickup_at: raw.delivery_time ? new Date(raw.delivery_time).toISOString() : null,
      notes:             raw.special_instructions || "",
      raw_payload:       raw
    };
  }

  /**
   * Zomato Partner API response -> common order.
   * Docs: https://www.zomato.com/business (requires partner dashboard access)
   */
  function normalizeZomato(raw) {
    const items = (raw.items || []).map((i) => ({
      name:     i.item_name || i.name,
      quantity: Number(i.quantity) || 1,
      price:    Number(i.item_price || i.price) || 0,
      addons:   (i.customizations || []).map((c) => ({ name: c.name, price: Number(c.price) || 0 }))
    }));
    return {
      platform:          PLATFORMS.ZOMATO,
      platform_order_id: String(raw.id || raw.order_id),
      status:            STATUS.NEW,
      customer_name:     raw.customer?.name || "",
      customer_phone:    raw.customer?.phone || "",
      items,
      subtotal:          Number(raw.subtotal)    || 0,
      tax:               Number(raw.taxes)       || 0,
      delivery_charge:   Number(raw.delivery_fee) || 0,
      discount:          Number(raw.discount_total) || 0,
      total:             Number(raw.grand_total || raw.total) || 0,
      delivery_address:  raw.address || null,
      estimated_pickup_at: raw.delivery_details?.time ? new Date(raw.delivery_details.time).toISOString() : null,
      notes:             raw.special_instructions || "",
      raw_payload:       raw
    };
  }

  // -- Core Factory -------------------------------------------------------------

  /**
   * @param {object} options
   * @param {object} options.db          - tenant-data Supabase-like client
   * @param {string} options.tenantId    - UUID of this tenant
   * @param {number} [options.pollIntervalMs=60000] - how often to auto-poll
   */
  function create(options) {
    const config      = options || {};
    const db          = config.db;
    const tenantId    = config.tenantId;
    const pollMs      = Number(config.pollIntervalMs) || 60_000;
    const listeners   = [];
    let   pollTimer   = null;

    if (!db)       throw new Error("aggregators.create: db is required");
    if (!tenantId) throw new Error("aggregators.create: tenantId is required");

    // -- Private helpers --------------------------------------------------------

    function emit(event) {
      listeners.forEach((fn) => { try { fn(event); } catch (_) {} });
    }

    async function loadConfigs() {
      const { data, error } = await db
        .from("doppio_aggregator_config")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("enabled", true);
      if (error) throw new Error("Failed to load aggregator configs: " + error.message);
      return data || [];
    }

    /**
     * Fetch new orders from Swiggy Partner API.
     * NOTE: Swiggy Partner API requires whitelisted IP + approved integration.
     * Replace this stub with real credentials from your Swiggy Partner dashboard.
     */
    async function fetchSwiggyOrders(cfg) {
      // Real endpoint: POST https://partner.swiggy.com/api/v1/orders/list
      // Auth: Bearer token obtained via OAuth from cfg.api_key + cfg.api_secret
      const response = await fetch(
        `https://partner.swiggy.com/api/v1/orders/list`,
        {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${cfg.api_key}`,
            "X-Store-Id":    cfg.store_id
          },
          body: JSON.stringify({ status: "new", limit: 50 })
        }
      );
      if (!response.ok) {
        const msg = await response.text().catch(() => response.statusText);
        throw new Error(`Swiggy API error ${response.status}: ${msg}`);
      }
      const json = await response.json();
      return (json.orders || json.data || []).map(normalizeSwiggy);
    }

    /**
     * Fetch new orders from Zomato Partner API.
     * NOTE: Requires approved Zomato partner account + API credentials.
     */
    async function fetchZomatoOrders(cfg) {
      // Real endpoint: GET https://api.zomato.com/partner/v1/orders
      const response = await fetch(
        `https://api.zomato.com/partner/v1/orders?status=placed&restaurant_id=${cfg.store_id}`,
        {
          headers: {
            "Authorization": `Bearer ${cfg.api_key}`,
            "Content-Type":  "application/json"
          }
        }
      );
      if (!response.ok) {
        const msg = await response.text().catch(() => response.statusText);
        throw new Error(`Zomato API error ${response.status}: ${msg}`);
      }
      const json = await response.json();
      return (json.orders || []).map(normalizeZomato);
    }

    async function upsertOrders(orders) {
      if (!orders.length) return;
      const rows = orders.map((o) => ({ ...o, tenant_id: tenantId }));
      const { error } = await db
        .from("doppio_online_orders")
        .upsert(rows, { onConflict: "tenant_id,platform,platform_order_id" });
      if (error) throw new Error("Failed to save online orders: " + error.message);
    }

    // -- Public API -------------------------------------------------------------

    /**
     * Poll all enabled platforms and persist new orders.
     * @returns {Promise<{swiggy: number, zomato: number, errors: string[]}>}
     */
    async function poll() {
      const configs = await loadConfigs();
      const result  = { swiggy: 0, zomato: 0, errors: [] };

      for (const cfg of configs) {
        try {
          let orders = [];
          if (cfg.platform === PLATFORMS.SWIGGY) {
            orders = await fetchSwiggyOrders(cfg);
            result.swiggy += orders.length;
          } else if (cfg.platform === PLATFORMS.ZOMATO) {
            orders = await fetchZomatoOrders(cfg);
            result.zomato += orders.length;
          }
          await upsertOrders(orders);
          if (orders.length) emit({ type: "new_orders", platform: cfg.platform, count: orders.length });
        } catch (err) {
          result.errors.push(`${cfg.platform}: ${err.message}`);
        }
      }
      return result;
    }

    /**
     * Load current orders from DB (optionally filter by status).
     */
    async function listOrders(statusFilter) {
      let query = db
        .from("doppio_online_orders")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw new Error("Failed to load online orders: " + error.message);
      return data || [];
    }

    async function updateStatus(orderId, status, extra) {
      const patch = { status, updated_at: new Date().toISOString(), ...(extra || {}) };
      const { error } = await db
        .from("doppio_online_orders")
        .update(patch)
        .eq("id", orderId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to update order: " + error.message);
      emit({ type: "order_updated", orderId, status });
    }

    async function accept(orderId) {
      return updateStatus(orderId, STATUS.ACCEPTED, { accepted_at: new Date().toISOString() });
    }

    async function reject(orderId, reason) {
      return updateStatus(orderId, STATUS.CANCELLED, { notes: reason || "Rejected by restaurant" });
    }

    async function markPreparing(orderId) {
      return updateStatus(orderId, STATUS.PREPARING);
    }

    async function markReady(orderId) {
      return updateStatus(orderId, STATUS.READY, { ready_at: new Date().toISOString() });
    }

    async function markPickedUp(orderId) {
      return updateStatus(orderId, STATUS.PICKED_UP);
    }

    /** Save or update aggregator credentials for a platform */
    async function saveConfig(platform, storeId, apiKey, apiSecret) {
      if (!PLATFORMS[platform.toUpperCase()]) throw new Error("Unknown platform: " + platform);
      const { error } = await db
        .from("doppio_aggregator_config")
        .upsert(
          { tenant_id: tenantId, platform, store_id: storeId, api_key: apiKey, api_secret: apiSecret || null, enabled: true },
          { onConflict: "tenant_id,platform" }
        );
      if (error) throw new Error("Failed to save config: " + error.message);
    }

    /** Register a listener for real-time events */
    function subscribe(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i !== -1) listeners.splice(i, 1); };
    }

    /** Start auto-polling on an interval */
    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(() => poll().catch(console.warn), pollMs);
    }

    /** Stop auto-polling */
    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    return {
      poll,
      listOrders,
      accept,
      reject,
      markPreparing,
      markReady,
      markPickedUp,
      saveConfig,
      subscribe,
      startPolling,
      stopPolling,
      STATUS,
      PLATFORMS
    };
  }

  // -- Utility: render an order card (returns HTML string) ---------------------

  function renderOrderCard(order) {
    const badge = {
      new:        "background:#f59e0b;color:#fff",
      accepted:   "background:#3b82f6;color:#fff",
      preparing:  "background:#8b5cf6;color:#fff",
      ready:      "background:#10b981;color:#fff",
      picked_up:  "background:#6b7280;color:#fff",
      delivered:  "background:#6b7280;color:#fff",
      cancelled:  "background:#ef4444;color:#fff"
    }[order.status] || "";

    const platformIcon = order.platform === "swiggy"
      ? "🧡 Swiggy"
      : order.platform === "zomato"
      ? "❤️ Zomato"
      : "📦 Online";

    const itemsHtml = (order.items || [])
      .map((i) => `<li>${i.quantity}× ${i.name} -- ₹${(i.price * i.quantity).toFixed(2)}</li>`)
      .join("");

    const actions = {
      new:       `<button onclick="RestroSuite.aggregators._ui.accept('${order.id}')">Accept</button>
                  <button onclick="RestroSuite.aggregators._ui.reject('${order.id}')">Reject</button>`,
      accepted:  `<button onclick="RestroSuite.aggregators._ui.markPreparing('${order.id}')">Start Preparing</button>`,
      preparing: `<button onclick="RestroSuite.aggregators._ui.markReady('${order.id}')">Mark Ready</button>`,
      ready:     `<button onclick="RestroSuite.aggregators._ui.markPickedUp('${order.id}')">Picked Up</button>`
    }[order.status] || "";

    return `
<div class="online-order-card" data-order-id="${order.id}" data-status="${order.status}">
  <div class="order-header">
    <span class="platform-badge">${platformIcon}</span>
    <span class="order-id">#${order.platform_order_id}</span>
    <span class="status-badge" style="${badge}">${order.status.replace("_", " ").toUpperCase()}</span>
    <span class="order-total">₹${Number(order.total).toFixed(2)}</span>
  </div>
  <div class="customer-info">
    👤 ${order.customer_name || "Guest"} ${order.customer_phone ? "· " + order.customer_phone : ""}
  </div>
  <ul class="order-items">${itemsHtml}</ul>
  ${order.notes ? `<p class="order-notes">📝 ${order.notes}</p>` : ""}
  <div class="order-actions">${actions}</div>
</div>`.trim();
  }

  return { create, renderOrderCard, STATUS, PLATFORMS };
});
