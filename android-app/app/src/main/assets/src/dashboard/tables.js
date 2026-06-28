/**
 * tables.js -- Table management: layout, reservations, waitlist
 *
 * Responsibilities:
 *  - CRUD for table layout (doppio_table_layout)
 *  - Table status management (available / occupied / reserved / blocked)
 *  - Reservations (doppio_reservations)
 *  - Waitlist (doppio_waitlist)
 *  - Helpers to seat a walk-in or a reservation
 *
 * Usage:
 *   const tm = RestroSuite.tables.create({ db, tenantId });
 *   const tables = await tm.listTables();
 *   await tm.setStatus(tableId, 'occupied');
 *   await tm.addReservation({ customer_name, customer_phone, party_size, reserved_at });
 *   await tm.addToWaitlist({ customer_name, party_size });
 *   await tm.seatFromWaitlist(waitlistId, tableId);
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.tables = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // -- Status constants ---------------------------------------------------------

  const TABLE_STATUS = {
    AVAILABLE: "available",
    OCCUPIED:  "occupied",
    RESERVED:  "reserved",
    BLOCKED:   "blocked"
  };

  const RESERVATION_STATUS = {
    CONFIRMED: "confirmed",
    ARRIVED:   "arrived",
    CANCELLED: "cancelled",
    NO_SHOW:   "no_show"
  };

  const WAITLIST_STATUS = {
    WAITING:   "waiting",
    SEATED:    "seated",
    CANCELLED: "cancelled",
    NO_SHOW:   "no_show"
  };

  // -- Factory ------------------------------------------------------------------

  /**
   * @param {object} options
   * @param {object} options.db       - tenant-data Supabase-like client
   * @param {string} options.tenantId - UUID of this tenant
   */
  function create(options) {
    const config   = options || {};
    const db       = config.db;
    const tenantId = config.tenantId;

    if (!db)       throw new Error("tables.create: db is required");
    if (!tenantId) throw new Error("tables.create: tenantId is required");

    // -- Table Layout -----------------------------------------------------------

    /** Return all tables, ordered by section then table_number */
    async function listTables() {
      const { data, error } = await db
        .from("doppio_table_layout")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("section", { ascending: true });
      if (error) throw new Error("Failed to load tables: " + error.message);
      return data || [];
    }

    /** Add a new table */
    async function addTable({ table_number, label, capacity, section, pos_x, pos_y }) {
      if (!table_number) throw new Error("table_number is required");
      const { data, error } = await db
        .from("doppio_table_layout")
        .insert({
          tenant_id: tenantId,
          table_number: String(table_number),
          label:    label || ("Table " + table_number),
          capacity: Number(capacity) || 4,
          section:  section || "main",
          pos_x:    Number(pos_x) || 0,
          pos_y:    Number(pos_y) || 0,
          status:   TABLE_STATUS.AVAILABLE
        })
        .select()
        .single();
      if (error) throw new Error("Failed to add table: " + error.message);
      return data;
    }

    /** Update table status */
    async function setStatus(tableId, status, currentOrderId) {
      if (!TABLE_STATUS[status.toUpperCase()]) {
        throw new Error("Invalid table status: " + status);
      }
      const patch = { status, updated_at: new Date().toISOString() };
      if (currentOrderId !== undefined) patch.current_order_id = currentOrderId;
      if (status === TABLE_STATUS.AVAILABLE) patch.current_order_id = null;

      const { error } = await db
        .from("doppio_table_layout")
        .update(patch)
        .eq("id", tableId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to update table status: " + error.message);
    }

    /** Update a table's layout position (for floor plan drag/drop) */
    async function updatePosition(tableId, posX, posY) {
      const { error } = await db
        .from("doppio_table_layout")
        .update({ pos_x: Number(posX) || 0, pos_y: Number(posY) || 0 })
        .eq("id", tableId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to update table position: " + error.message);
    }

    /** Delete a table (only if available) */
    async function removeTable(tableId) {
      const { data } = await db
        .from("doppio_table_layout")
        .select("status")
        .eq("id", tableId)
        .eq("tenant_id", tenantId)
        .single();
      if (data && data.status !== TABLE_STATUS.AVAILABLE) {
        throw new Error("Cannot remove a table that is not available.");
      }
      const { error } = await db
        .from("doppio_table_layout")
        .delete()
        .eq("id", tableId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to remove table: " + error.message);
    }

    /** Get summary: count per status */
    async function getStatusSummary() {
      const tables = await listTables();
      return tables.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, { available: 0, occupied: 0, reserved: 0, blocked: 0 });
    }

    // -- Reservations -----------------------------------------------------------

    /**
     * List reservations.
     * @param {string} [date] - ISO date string to filter (e.g. "2026-06-13")
     */
    async function listReservations(date) {
      let query = db
        .from("doppio_reservations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("reserved_at", { ascending: true });

      // Date filter: compare date portion only
      // (Supabase gte/lte not in our tiny query builder, so we filter client-side)
      const { data, error } = await query;
      if (error) throw new Error("Failed to load reservations: " + error.message);
      const rows = data || [];
      if (!date) return rows;
      return rows.filter((r) => {
        const d = new Date(r.reserved_at || r.date);
        return d.toISOString().slice(0, 10) === date;
      });
    }

    /**
     * Add a reservation.
     * @param {object} opts
     * @param {string} opts.customer_name
     * @param {string} [opts.customer_phone]
     * @param {number} [opts.party_size]
     * @param {string} opts.reserved_at - ISO datetime
     * @param {string} [opts.table_id]
     * @param {string} [opts.notes]
     * @param {number} [opts.deposit_paid]
     */
    async function addReservation({ customer_name, customer_phone, party_size, reserved_at, table_id, notes, deposit_paid }) {
      if (!customer_name) throw new Error("customer_name is required");
      if (!reserved_at)   throw new Error("reserved_at is required");

      const { data, error } = await db
        .from("doppio_reservations")
        .insert({
          tenant_id:      tenantId,
          customer_name,
          customer_phone: customer_phone || null,
          party_size:     Number(party_size) || 1,
          reserved_at:    new Date(reserved_at).toISOString(),
          table_id:       table_id || null,
          notes:          notes || null,
          deposit_paid:   Number(deposit_paid) || 0,
          status:         RESERVATION_STATUS.CONFIRMED
        })
        .select()
        .single();
      if (error) throw new Error("Failed to add reservation: " + error.message);

      // Mark table as reserved
      if (table_id) await setStatus(table_id, TABLE_STATUS.RESERVED).catch(() => {});
      return data;
    }

    /** Mark a reservation as arrived and seat the guest */
    async function arriveReservation(reservationId, tableId) {
      const { error } = await db
        .from("doppio_reservations")
        .update({ status: RESERVATION_STATUS.ARRIVED, table_id: tableId || null })
        .eq("id", reservationId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to update reservation: " + error.message);
      if (tableId) await setStatus(tableId, TABLE_STATUS.OCCUPIED).catch(() => {});
    }

    async function cancelReservation(reservationId) {
      const { data } = await db
        .from("doppio_reservations")
        .select("table_id, status")
        .eq("id", reservationId)
        .eq("tenant_id", tenantId)
        .single();

      const { error } = await db
        .from("doppio_reservations")
        .update({ status: RESERVATION_STATUS.CANCELLED })
        .eq("id", reservationId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to cancel reservation: " + error.message);

      // Free the table if it was reserved
      if (data && data.table_id && data.status === RESERVATION_STATUS.CONFIRMED) {
        await setStatus(data.table_id, TABLE_STATUS.AVAILABLE).catch(() => {});
      }
    }

    async function markNoShow(reservationId) {
      const { data } = await db
        .from("doppio_reservations")
        .select("table_id")
        .eq("id", reservationId)
        .eq("tenant_id", tenantId)
        .single();

      await db
        .from("doppio_reservations")
        .update({ status: RESERVATION_STATUS.NO_SHOW })
        .eq("id", reservationId)
        .eq("tenant_id", tenantId);

      if (data && data.table_id) {
        await setStatus(data.table_id, TABLE_STATUS.AVAILABLE).catch(() => {});
      }
    }

    // -- Waitlist ---------------------------------------------------------------

    /** Get active waitlist entries (status = 'waiting'), oldest first */
    async function listWaitlist() {
      const { data, error } = await db
        .from("doppio_waitlist")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", WAITLIST_STATUS.WAITING)
        .order("joined_at", { ascending: true });
      if (error) throw new Error("Failed to load waitlist: " + error.message);
      return data || [];
    }

    /**
     * Add a party to the waitlist.
     * @param {object} opts
     * @param {string} opts.customer_name
     * @param {string} [opts.customer_phone]
     * @param {number} [opts.party_size]
     * @param {string} [opts.notes]
     */
    async function addToWaitlist({ customer_name, customer_phone, party_size, notes }) {
      if (!customer_name) throw new Error("customer_name is required");
      const { data, error } = await db
        .from("doppio_waitlist")
        .insert({
          tenant_id:      tenantId,
          customer_name,
          customer_phone: customer_phone || null,
          party_size:     Number(party_size) || 1,
          notes:          notes || null,
          status:         WAITLIST_STATUS.WAITING,
          joined_at:      new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw new Error("Failed to add to waitlist: " + error.message);
      return data;
    }

    /** Seat a waitlist guest at a table */
    async function seatFromWaitlist(waitlistId, tableId) {
      const { error } = await db
        .from("doppio_waitlist")
        .update({
          status:    WAITLIST_STATUS.SEATED,
          seated_at: new Date().toISOString(),
          table_id:  tableId
        })
        .eq("id", waitlistId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to seat from waitlist: " + error.message);
      if (tableId) await setStatus(tableId, TABLE_STATUS.OCCUPIED).catch(() => {});
    }

    async function removeFromWaitlist(waitlistId, reason) {
      const status = reason === "no_show" ? WAITLIST_STATUS.NO_SHOW : WAITLIST_STATUS.CANCELLED;
      const { error } = await db
        .from("doppio_waitlist")
        .update({ status })
        .eq("id", waitlistId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error("Failed to remove from waitlist: " + error.message);
    }

    /** Estimated wait time in minutes based on current waitlist length */
    function estimatedWaitMinutes(waitlistEntries, avgTurnoverMinutes) {
      const turnover = Number(avgTurnoverMinutes) || 30;
      const waiting  = (waitlistEntries || []).filter((e) => e.status === WAITLIST_STATUS.WAITING);
      return waiting.length * turnover;
    }

    return {
      // Tables
      listTables,
      addTable,
      setStatus,
      updatePosition,
      removeTable,
      getStatusSummary,
      // Reservations
      listReservations,
      addReservation,
      arriveReservation,
      cancelReservation,
      markNoShow,
      // Waitlist
      listWaitlist,
      addToWaitlist,
      seatFromWaitlist,
      removeFromWaitlist,
      estimatedWaitMinutes,
      // Constants
      TABLE_STATUS,
      RESERVATION_STATUS,
      WAITLIST_STATUS
    };
  }

  // -- UI Helpers ---------------------------------------------------------------

  const STATUS_COLOR = {
    available: "#10b981",
    occupied:  "#ef4444",
    reserved:  "#f59e0b",
    blocked:   "#6b7280"
  };

  /** Render a single table tile for the floor plan */
  function renderTableTile(table, onClick) {
    const color = STATUS_COLOR[table.status] || "#6b7280";
    const el = document.createElement("div");
    el.className  = "table-tile";
    el.dataset.id = table.id;
    el.style.cssText = [
      `background:${color}`,
      "color:#fff",
      "border-radius:8px",
      "padding:12px",
      "cursor:pointer",
      "min-width:80px",
      "text-align:center",
      "font-weight:600",
      "user-select:none"
    ].join(";");
    el.innerHTML = `
      <div>${table.label || table.table_number}</div>
      <div style="font-size:0.75em;opacity:0.85">Cap. ${table.capacity}</div>
      <div style="font-size:0.7em;text-transform:uppercase;margin-top:4px">${table.status}</div>
    `;
    if (typeof onClick === "function") el.addEventListener("click", () => onClick(table));
    return el;
  }

  /** Render the full floor plan grid into a container element */
  function renderFloorPlan(containerEl, tables, onTableClick) {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    const grouped = tables.reduce((acc, t) => {
      (acc[t.section] = acc[t.section] || []).push(t);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([section, sectionTables]) => {
      const sectionDiv = document.createElement("div");
      sectionDiv.style.cssText = "margin-bottom:24px";
      sectionDiv.innerHTML = `<h4 style="text-transform:capitalize;margin-bottom:8px">${section}</h4>`;
      const grid = document.createElement("div");
      grid.style.cssText = "display:flex;flex-wrap:wrap;gap:12px";
      sectionTables.forEach((t) => grid.appendChild(renderTableTile(t, onTableClick)));
      sectionDiv.appendChild(grid);
      containerEl.appendChild(sectionDiv);
    });
  }

  return { create, renderFloorPlan, renderTableTile, STATUS_COLOR, TABLE_STATUS, RESERVATION_STATUS, WAITLIST_STATUS };
});
