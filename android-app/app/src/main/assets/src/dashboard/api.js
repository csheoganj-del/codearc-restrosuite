(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.RestroSuite = root.RestroSuite || {};
    root.RestroSuite.api = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TENANT_TABLES = new Set([
    "doppio_business_profile",
    "doppio_menu",
    "doppio_inventory",
    "doppio_bills",
    "doppio_pending_orders",
    "doppio_shifts",
    "doppio_shift_events",
    "doppio_employees",
    "doppio_leave_requests",
    "doppio_attendance",
    "doppio_crm",
    "doppio_inventory_batches",
    "doppio_notifications",
    "doppio_custom_recipes",
    "doppio_inventory_thresholds",
    "doppio_pos_popularity",
    "doppio_draft_orders",
    "doppio_support_tickets",
    "doppio_onboarding_tasks",
    "doppio_reservations",
    "doppio_vendors",
    "doppio_purchase_orders",
    "doppio_item_costs",
    "doppio_offers",
    "doppio_refund_requests",
    "doppio_device_setups",
    "doppio_backup_snapshots",
    "doppio_outlets",
    "doppio_migration_status",
    "doppio_saas_invoices",
    // Feature additions (aggregators, table management, analytics)
    "doppio_aggregator_config",
    "doppio_online_orders",
    "doppio_table_layout",
    "doppio_waitlist",
    "doppio_tax_rates"
  ]);

  function createTenantApi(options) {
    const config = options || {};
    const fetchImpl = config.fetchImpl || fetch;
    const baseUrl = String(config.baseUrl || "").replace(/\/$/, "");
    const anonKey = String(config.anonKey || "");
    const readCache = new Map();
    const READ_CACHE_TTL_MS = 1500;

    async function post(functionName, body, token, fallbackMessage) {
      const response = await fetchImpl(`${baseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(result.error || fallbackMessage);
        error.status = response.status;
        throw error;
      }
      return result;
    }

    async function access(action, payload) {
      return post(
        "tenant-access",
        { action, ...(payload || {}) },
        anonKey,
        "Session validation failed."
      );
    }

    async function admin(action, payload) {
      const token = config.getAdminToken && config.getAdminToken();
      if (!token) throw new Error("Superadmin session expired. Please log in again.");
      try {
        return await post(
          "tenant-admin",
          { action, ...(payload || {}) },
          token,
          "Superadmin request failed."
        );
      } catch (error) {
        if (error.status === 401 && config.onAdminUnauthorized) {
          config.onAdminUnauthorized();
        }
        throw error;
      }
    }

    async function staff(action, payload) {
      const token = config.getTenantToken && config.getTenantToken();
      if (!token) throw new Error("Tenant session expired. Please log in again.");
      return post(
        "tenant-users",
        { action, ...(payload || {}) },
        token,
        "Staff account request failed."
      );
    }

    function createTenantDataClient(nativeClient) {
      function makeTenantQuery(table) {
        const state = {
          table,
          operation: null,
          columns: "*",
          data: undefined,
          filters: [],
          order: null,
          limit: null,
          single: false,
          maybeSingle: false,
          returning: false,
          options: {}
        };

        const execute = async () => {
          const token = config.getTenantToken && config.getTenantToken();
          if (!token) {
            return {
              data: null,
              error: { message: "Tenant session expired. Please log in again." }
            };
          }
          const payload = JSON.parse(JSON.stringify(state));
          const isCacheableRead = payload.operation === "select" && !payload.single && !payload.maybeSingle;
          const cacheKey = isCacheableRead ? JSON.stringify(payload) : "";
          if (isCacheableRead) {
            const cached = readCache.get(cacheKey);
            if (cached && Date.now() - cached.time < READ_CACHE_TTL_MS) {
              return { data: cached.data, error: null };
            }
          }
          try {
            const result = await post(
              "tenant-data",
              payload,
              token,
              "Tenant data request failed."
            );
            if (isCacheableRead) readCache.set(cacheKey, { time: Date.now(), data: result.data });
            if (payload.operation !== "select") readCache.clear();
            return { data: result.data, error: null };
          } catch (error) {
            return { data: null, error: { message: error.message } };
          }
        };

        const builder = {
          select(columns = "*") {
            if (!state.operation) state.operation = "select";
            else state.returning = true;
            state.columns = columns;
            return builder;
          },
          insert(data) {
            state.operation = "insert";
            state.data = data;
            return builder;
          },
          update(data) {
            state.operation = "update";
            state.data = data;
            return builder;
          },
          upsert(data, options = {}) {
            state.operation = "upsert";
            state.data = data;
            state.options = options;
            return builder;
          },
          delete() {
            state.operation = "delete";
            return builder;
          },
          eq(column, value) {
            state.filters.push({ operator: "eq", column, value });
            return builder;
          },
          in(column, value) {
            state.filters.push({ operator: "in", column, value });
            return builder;
          },
          not(column, operator, value) {
            state.filters.push({
              operator: "not",
              comparisonOperator: operator,
              column,
              value
            });
            return builder;
          },
          order(column, options = {}) {
            state.order = { column, ascending: options.ascending !== false };
            return builder;
          },
          limit(value) {
            state.limit = value;
            return builder;
          },
          single() {
            state.single = true;
            return builder;
          },
          maybeSingle() {
            state.maybeSingle = true;
            return builder;
          },
          then(resolve, reject) {
            if (!state.operation) state.operation = "select";
            return execute().then(resolve, reject);
          },
          catch(reject) {
            if (!state.operation) state.operation = "select";
            return execute().catch(reject);
          }
        };
        return builder;
      }

      return {
        from(table) {
          if (TENANT_TABLES.has(table)) return makeTenantQuery(table);
          return nativeClient.from(table);
        },
        channel(...args) {
          return nativeClient.channel(...args);
        },
        removeChannel(...args) {
          return nativeClient.removeChannel(...args);
        }
      };
    }

    return { access, admin, staff, createTenantDataClient };
  }

  return { createTenantApi };
});
