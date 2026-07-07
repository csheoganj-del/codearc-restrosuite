/**
 * analytics.js -- Advanced analytics engine
 *
 * Computes insights from existing doppio_bills, doppio_attendance,
 * doppio_employees, and doppio_pos_popularity tables.
 * No extra DB tables needed -- all derived from data you already have.
 *
 * Provides:
 *  - Hourly revenue breakdown
 *  - Daily / weekly / monthly revenue trends
 *  - Item popularity + revenue per item
 *  - Staff activity summary (hours worked, attendance rate)
 *  - Average order value, peak hours, busiest days
 *  - Online order revenue (if aggregators module is active)
 *
 * Usage:
 *   const an = RestroSuite.analytics.create({ db, tenantId });
 *   const hourly  = await an.hourlyRevenue({ days: 7 });
 *   const daily   = await an.dailyRevenue({ days: 30 });
 *   const items   = await an.itemPopularity({ limit: 10 });
 *   const staff   = await an.staffActivity({ month: '2026-06' });
 *   const summary = await an.revenueSummary();
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.analytics = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // -- Helpers ------------------------------------------------------------------

  function num(v) { return Number(v) || 0; }

  function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  /**
   * Group an array of objects by a key-producing function.
   * @returns {Object.<string, any[]>}
   */
  function groupBy(arr, keyFn) {
    return arr.reduce((acc, item) => {
      const k = keyFn(item);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  }

  function safeJsonArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch (_) {} }
    return [];
  }

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // -- Factory ------------------------------------------------------------------

  function create(options) {
    const config   = options || {};
    const db       = config.db;
    const tenantId = config.tenantId;

    if (!db)       throw new Error("analytics.create: db is required");
    if (!tenantId) throw new Error("analytics.create: tenantId is required");

    // -- Data loaders ----------------------------------------------------------

    async function fetchBills(sinceIso) {
      let query = db
        .from("doppio_bills")
        .select("id, created_at, total, items, paymentMethod, customerName, tenders")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });
      const { data, error } = await query;
      if (error) throw new Error("Failed to load bills: " + error.message);
      const rows = data || [];
      if (sinceIso) return rows.filter((b) => b.created_at >= sinceIso);
      return rows;
    }

    async function fetchAttendance(sinceIso) {
      const { data, error } = await db
        .from("doppio_attendance")
        .select("employeeId, date, status, clockInTime, clockOutTime, hoursWorked")
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to load attendance: " + error.message);
      const rows = data || [];
      if (sinceIso) return rows.filter((a) => (a.date || "") >= sinceIso.slice(0, 10));
      return rows;
    }

    async function fetchEmployees() {
      const { data, error } = await db
        .from("doppio_employees")
        .select("id, name, role")
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to load employees: " + error.message);
      return data || [];
    }

    async function fetchOnlineOrders(sinceIso) {
      const { data } = await db
        .from("doppio_online_orders")
        .select("id, created_at, platform, total, status")
        .eq("tenant_id", tenantId);
      const rows = data || [];
      if (sinceIso) return rows.filter((o) => o.created_at >= sinceIso);
      return rows;
    }

    // -- Revenue: Hourly -------------------------------------------------------

    /**
     * Revenue grouped by hour of day (0-23), averaged over the requested period.
     * @param {{ days?: number }} opts
     * @returns {Promise<Array<{ hour: number, revenue: number, orders: number }>>}
     */
    async function hourlyRevenue({ days = 7 } = {}) {
      const bills = await fetchBills(daysAgo(days));
      const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: 0, orders: 0 }));
      bills.forEach((b) => {
        const h = new Date(b.created_at).getHours();
        buckets[h].revenue += num(b.total);
        buckets[h].orders  += 1;
      });
      return buckets;
    }

    // -- Revenue: Daily --------------------------------------------------------

    /**
     * Revenue per calendar day over the last N days.
     * @returns {Promise<Array<{ date: string, revenue: number, orders: number, avg_order_value: number }>>}
     */
    async function dailyRevenue({ days = 30 } = {}) {
      const bills   = await fetchBills(daysAgo(days));
      const byDay   = groupBy(bills, (b) => isoDate(b.created_at));

      // Build contiguous date range
      const result  = [];
      for (let i = days - 1; i >= 0; i--) {
        const d     = new Date();
        d.setDate(d.getDate() - i);
        const key   = isoDate(d);
        const rows  = byDay[key] || [];
        const rev   = rows.reduce((s, b) => s + num(b.total), 0);
        result.push({
          date:            key,
          day_of_week:     DAY_NAMES[d.getDay()],
          revenue:         rev,
          orders:          rows.length,
          avg_order_value: rows.length ? rev / rows.length : 0
        });
      }
      return result;
    }

    // -- Revenue: Weekly -------------------------------------------------------

    async function weeklyRevenue({ weeks = 12 } = {}) {
      const daily = await dailyRevenue({ days: weeks * 7 });
      const byWeek = [];
      for (let w = 0; w < weeks; w++) {
        const slice = daily.slice(w * 7, (w + 1) * 7);
        const revenue = slice.reduce((s, d) => s + d.revenue, 0);
        const orders  = slice.reduce((s, d) => s + d.orders, 0);
        byWeek.push({
          week_start:      slice[0]?.date || "",
          week_end:        slice[slice.length - 1]?.date || "",
          revenue,
          orders,
          avg_order_value: orders ? revenue / orders : 0
        });
      }
      return byWeek;
    }

    // -- Revenue: Monthly ------------------------------------------------------

    async function monthlyRevenue({ months = 6 } = {}) {
      const bills  = await fetchBills(daysAgo(months * 31));
      const byMonth = groupBy(bills, (b) => b.created_at.slice(0, 7)); // "YYYY-MM"
      const result = [];
      for (let m = months - 1; m >= 0; m--) {
        const d   = new Date();
        d.setMonth(d.getMonth() - m, 1);
        const key = d.toISOString().slice(0, 7);
        const rows = byMonth[key] || [];
        const revenue = rows.reduce((s, b) => s + num(b.total), 0);
        result.push({
          month:           key,
          revenue,
          orders:          rows.length,
          avg_order_value: rows.length ? revenue / rows.length : 0
        });
      }
      return result;
    }

    // -- Item Popularity -------------------------------------------------------

    /**
     * Top-selling items by quantity.
     * @param {{ days?: number, limit?: number }} opts
     * @returns {Promise<Array<{ name: string, qty_sold: number, revenue: number, orders: number }>>}
     */
    async function itemPopularity({ days = 30, limit = 20 } = {}) {
      const bills = await fetchBills(daysAgo(days));
      const map   = new Map();

      bills.forEach((bill) => {
        const items = safeJsonArray(bill.items);
        items.forEach((item) => {
          const name    = String(item.name || item.item_name || "Unknown").trim();
          const qty     = num(item.qty || item.quantity || 1);
          const price   = num(item.price || item.unit_price || 0);
          const revenue = price * qty;
          if (!map.has(name)) map.set(name, { name, qty_sold: 0, revenue: 0, orders: 0 });
          const entry = map.get(name);
          entry.qty_sold += qty;
          entry.revenue  += revenue;
          entry.orders   += 1;
        });
      });

      return [...map.values()]
        .sort((a, b) => b.qty_sold - a.qty_sold)
        .slice(0, limit)
        .map((e) => ({ ...e, avg_price: e.qty_sold ? e.revenue / e.qty_sold : 0 }));
    }

    // -- Payment Method Breakdown ----------------------------------------------

    async function paymentBreakdown({ days = 30 } = {}) {
      const bills  = await fetchBills(daysAgo(days));
      const payCounts = {};
      const orderCounts = {};
      
      bills.forEach(b => {
        let tenders = b.tenders;
        if (tenders && typeof tenders === 'string') {
          try { tenders = JSON.parse(tenders); } catch(e) { tenders = null; }
        }
        
        if (tenders && Array.isArray(tenders) && tenders.length) {
          tenders.forEach(t => {
            const m = String(t.method || "other").toLowerCase();
            payCounts[m] = (payCounts[m] || 0) + num(t.amount);
            orderCounts[m] = (orderCounts[m] || 0) + 1;
          });
        } else {
          const m = String(b.paymentMethod || b.payment_method || "other").toLowerCase();
          payCounts[m] = (payCounts[m] || 0) + num(b.total);
          orderCounts[m] = (orderCounts[m] || 0) + 1;
        }
      });
      
      return Object.entries(payCounts).map(([method, revenue]) => ({
        method,
        orders:  orderCounts[method] || 0,
        revenue
      })).sort((a, b) => b.revenue - a.revenue);
    }

    // -- Peak Analysis ---------------------------------------------------------

    /**
     * Identify peak hour and busiest day of week.
     * @param {{ days?: number }} opts
     */
    async function peakAnalysis({ days = 30 } = {}) {
      const [hourly, daily] = await Promise.all([
        hourlyRevenue({ days }),
        dailyRevenue({ days })
      ]);

      const peakHour = hourly.reduce((best, h) => h.orders > best.orders ? h : best, hourly[0]);

      const byDow = DAY_NAMES.map((name, i) => {
        const dayRows = daily.filter((d) => d.day_of_week === name);
        const revenue = dayRows.reduce((s, d) => s + d.revenue, 0);
        const orders  = dayRows.reduce((s, d) => s + d.orders, 0);
        return { day: name, revenue, orders };
      });
      const peakDay = byDow.reduce((best, d) => d.orders > best.orders ? d : best, byDow[0]);

      return { peakHour, peakDay, byDayOfWeek: byDow };
    }

    // -- Staff Activity --------------------------------------------------------

    /**
     * Staff activity summary for a month.
     * @param {{ month?: string }} opts - "YYYY-MM"
     */
    async function staffActivity({ month } = {}) {
      const targetMonth = month || new Date().toISOString().slice(0, 7);
      const [employees, attendance] = await Promise.all([
        fetchEmployees(),
        fetchAttendance(targetMonth + "-01")
      ]);

      const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));

      const filtered = attendance.filter((a) => {
        return (a.date || "").startsWith(targetMonth);
      });

      const byEmployee = groupBy(filtered, (a) => a.employeeId);

      return employees.map((emp) => {
        const records   = byEmployee[emp.id] || [];
        const present   = records.filter((r) => r.status === "present").length;
        const absent    = records.filter((r) => r.status === "absent").length;
        const late      = records.filter((r) => r.status === "late").length;
        const hoursWorked = records.reduce((sum, r) => {
          return sum + (num(r.hoursWorked) || 0);
        }, 0);

        return {
          employee_id:    emp.id,
          name:           emp.name,
          role:           emp.role,
          month:          targetMonth,
          days_present:   present,
          days_absent:    absent,
          days_late:      late,
          hours_worked:   Math.round(hoursWorked * 10) / 10,
          attendance_pct: records.length ? Math.round((present / records.length) * 100) : 0
        };
      });
    }

    // -- Online Order Revenue --------------------------------------------------

    async function onlineOrderRevenue({ days = 30 } = {}) {
      const orders  = await fetchOnlineOrders(daysAgo(days));
      const byPlatform = groupBy(orders, (o) => o.platform);
      return Object.entries(byPlatform).map(([platform, rows]) => ({
        platform,
        orders:  rows.length,
        revenue: rows.reduce((s, o) => s + num(o.total), 0),
        cancelled: rows.filter((o) => o.status === "cancelled").length
      }));
    }

    // -- Full Dashboard Summary ------------------------------------------------

    /**
     * All-in-one summary for the analytics dashboard card.
     * @param {{ days?: number }} opts
     */
    async function revenueSummary({ days = 30 } = {}) {
      const [daily, items, payment, peak, online] = await Promise.all([
        dailyRevenue({ days }),
        itemPopularity({ days, limit: 5 }),
        paymentBreakdown({ days }),
        peakAnalysis({ days }),
        onlineOrderRevenue({ days }).catch(() => []) // graceful if table missing
      ]);

      const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);
      const totalOrders  = daily.reduce((s, d) => s + d.orders, 0);
      const today        = daily[daily.length - 1] || {};

      return {
        period_days:        days,
        total_revenue:      totalRevenue,
        total_orders:       totalOrders,
        avg_order_value:    totalOrders ? totalRevenue / totalOrders : 0,
        today_revenue:      today.revenue || 0,
        today_orders:       today.orders  || 0,
        top_items:          items,
        payment_breakdown:  payment,
        peak:               peak,
        online_breakdown:   online,
        daily_trend:        daily
      };
    }

    return {
      hourlyRevenue,
      dailyRevenue,
      weeklyRevenue,
      monthlyRevenue,
      itemPopularity,
      paymentBreakdown,
      peakAnalysis,
      staffActivity,
      onlineOrderRevenue,
      revenueSummary
    };
  }

  // -- Chart renderer helpers (no library required) -----------------------------

  /**
   * Render a simple bar chart into a <canvas> element.
   * @param {HTMLCanvasElement} canvas
   * @param {{ labels: string[], values: number[], color?: string, title?: string }} opts
   */
  function renderBarChart(canvas, { labels, values, color = "#6366f1", title = "" }) {
    if (!canvas || !canvas.getContext) return;
    const ctx    = canvas.getContext("2d");
    const W      = canvas.width  || 600;
    const H      = canvas.height || 300;
    const PAD    = 48;
    const BAR_W  = Math.max(4, Math.floor((W - PAD * 2) / labels.length) - 4);
    const maxVal = Math.max(...values, 1);

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Title
    if (title) {
      ctx.fillStyle = "#e2e8f0";
      ctx.font      = "bold 13px sans-serif";
      ctx.fillText(title, PAD, 20);
    }

    // Bars
    labels.forEach((label, i) => {
      const barH   = Math.round(((values[i] || 0) / maxVal) * (H - PAD * 2));
      const x      = PAD + i * (BAR_W + 4);
      const y      = H - PAD - barH;

      ctx.fillStyle = color;
      ctx.fillRect(x, y, BAR_W, barH);

      // Label
      ctx.fillStyle   = "#94a3b8";
      ctx.font        = "10px sans-serif";
      ctx.textAlign   = "center";
      ctx.fillText(label, x + BAR_W / 2, H - PAD + 14);

      // Value on top of bar
      if (barH > 16) {
        ctx.fillStyle = "#fff";
        ctx.font      = "9px sans-serif";
        ctx.fillText(String(Math.round(values[i] || 0)), x + BAR_W / 2, y - 2);
      }
    });

    // Y-axis line
    ctx.strokeStyle = "#334155";
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD - 4, PAD - 10);
    ctx.lineTo(PAD - 4, H - PAD);
    ctx.lineTo(W - PAD, H - PAD);
    ctx.stroke();
  }

  /**
   * Render a donut/pie chart into a <canvas> element.
   * @param {HTMLCanvasElement} canvas
   * @param {{ labels: string[], values: number[], colors?: string[] }} opts
   */
  function renderDonutChart(canvas, { labels, values, colors }) {
    if (!canvas || !canvas.getContext) return;
    const ctx    = canvas.getContext("2d");
    const W      = canvas.width  || 300;
    const H      = canvas.height || 300;
    const cx     = W / 2;
    const cy     = H / 2;
    const r      = Math.min(W, H) / 2 - 16;
    const ir     = r * 0.55; // inner radius for donut
    const total  = values.reduce((s, v) => s + (v || 0), 0) || 1;
    const palette = colors || ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6"];

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    let startAngle = -Math.PI / 2;
    values.forEach((val, i) => {
      const slice = (val / total) * 2 * Math.PI;
      ctx.fillStyle   = palette[i % palette.length];
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fill();
      startAngle += slice;
    });

    // Donut hole
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(cx, cy, ir, 0, 2 * Math.PI);
    ctx.fill();

    // Legend
    const legendY = H - 12 * labels.length - 8;
    labels.forEach((lbl, i) => {
      const y = legendY + i * 14;
      ctx.fillStyle = palette[i % palette.length];
      ctx.fillRect(8, y, 10, 10);
      ctx.fillStyle = "#e2e8f0";
      ctx.font      = "10px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${lbl}: ${Math.round((values[i] / total) * 100)}%`, 22, y + 9);
    });
  }

  return { create, renderBarChart, renderDonutChart };
});
