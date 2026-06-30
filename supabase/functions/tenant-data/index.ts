import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://codearc-restrosuite.vercel.app";
// Exact-match origin allowlist (see tenant-access for rationale). Configure extra
// origins via ALLOWED_ORIGINS="https://a.com,https://b.com". Never suffix-match.
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || ALLOWED_ORIGIN)
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
ALLOWED_ORIGINS.add(ALLOWED_ORIGIN.replace(/\/+$/, ""));

function getCorsHeaders(req: Request) {
  const origin = (req.headers.get("origin") || "").replace(/\/+$/, "");
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPERADMIN_SESSION_SECRET = Deno.env.get("SUPERADMIN_SESSION_SECRET") || "";
const PIN_RESET_CODE_HASH = Deno.env.get("PIN_RESET_CODE_HASH")
  || Deno.env.get("MASTER_PIN_RESET_HASH")
  || "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  "doppio_aggregator_config",
  "doppio_online_orders",
  "doppio_table_layout",
  "doppio_waitlist",
  "doppio_tax_rates",
]);

const TABLE_TAB_ACCESS: Record<string, string[]> = {
  doppio_aggregator_config: ["pos-tab", "editor-tab", "online-tab", "aggregator-tab", "growth-hub-tab"],
  doppio_online_orders: ["pos-tab", "online-tab", "aggregator-tab", "growth-hub-tab"],
  doppio_table_layout: ["pos-tab", "growth-hub-tab"],
  doppio_waitlist: ["pos-tab", "crm-tab", "growth-hub-tab"],
  doppio_menu: ["pos-tab", "editor-tab", "online-tab"],
  doppio_inventory: ["pos-tab", "inventory-tab", "editor-tab"],
  doppio_inventory_batches: ["pos-tab", "inventory-tab"],
  doppio_inventory_thresholds: ["pos-tab", "inventory-tab"],
  doppio_bills: ["pos-tab", "bills-tab", "reports-tab", "tax-tab"],
  doppio_pending_orders: ["pos-tab", "qr-orders-tab", "kds-tab", "tokens-tab", "online-tab", "aggregator-tab"],
  doppio_shifts: ["pos-tab", "employees-tab"],
  doppio_shift_events: ["pos-tab", "employees-tab"],
  doppio_employees: ["employees-tab"],
  doppio_leave_requests: ["employees-tab"],
  doppio_attendance: ["employees-tab"],
  doppio_crm: ["pos-tab", "crm-tab", "customers-tab"],
  doppio_notifications: ["pos-tab", "qr-orders-tab", "inventory-tab", "employees-tab"],
  doppio_custom_recipes: ["pos-tab", "editor-tab"],
  doppio_pos_popularity: ["pos-tab", "reports-tab"],
  doppio_draft_orders: ["pos-tab"],
  doppio_support_tickets: ["growth-hub-tab"],
  doppio_onboarding_tasks: ["growth-hub-tab"],
  doppio_reservations: ["growth-hub-tab", "qr-orders-tab"],
  doppio_vendors: ["growth-hub-tab", "inventory-tab"],
  doppio_purchase_orders: ["growth-hub-tab", "inventory-tab"],
  doppio_item_costs: ["growth-hub-tab", "inventory-tab", "reports-tab"],
  doppio_offers: ["growth-hub-tab", "crm-tab"],
  doppio_refund_requests: ["growth-hub-tab", "bills-tab"],
  doppio_device_setups: ["growth-hub-tab"],
  doppio_backup_snapshots: ["growth-hub-tab"],
  doppio_outlets: ["growth-hub-tab", "reports-tab"],
  doppio_migration_status: ["growth-hub-tab"],
  doppio_saas_invoices: ["growth-hub-tab"],
  doppio_tax_rates: ["pos-tab", "tax-tab", "editor-tab"],
};

const ROLE_DEFAULT_TABS: Record<string, string[]> = {
  admin: Array.from(new Set(Object.values(TABLE_TAB_ACCESS).flat())),
  manager: [
    "pos-tab", "floor-tab", "qr-orders-tab", "kds-tab", "bills-tab",
    "inventory-tab", "editor-tab", "customers-tab", "reports-tab",
    "analytics-tab", "employees-tab", "growth-hub-tab",
  ],
  cashier: ["pos-tab", "floor-tab", "bills-tab", "customers-tab"],
  waiter: ["pos-tab", "floor-tab", "kds-tab"],
  captain: ["pos-tab", "floor-tab", "kds-tab", "qr-orders-tab"],
  kitchen: ["kds-tab"],
  inventory: ["inventory-tab", "editor-tab", "reports-tab"],
  customer_display: ["tokens-tab"],
};

const TABLE_WRITE_ROLES: Record<string, string[]> = {
  doppio_menu: ["inventory"],
  doppio_inventory: ["cashier", "inventory"],
  doppio_inventory_batches: ["cashier", "inventory"],
  doppio_inventory_thresholds: ["inventory"],
  doppio_bills: ["cashier"],
  doppio_pending_orders: ["cashier", "kitchen", "waiter", "captain"],
  doppio_shifts: ["cashier"],
  doppio_shift_events: ["cashier"],
  doppio_crm: ["cashier"],
  doppio_notifications: ["cashier", "kitchen", "waiter"],
  doppio_pos_popularity: ["cashier"],
  doppio_draft_orders: ["cashier", "waiter"],
  doppio_support_tickets: ["cashier", "kitchen", "waiter", "captain"],
  doppio_reservations: ["cashier", "waiter", "captain"],
};

const ZERO_COST_DEFAULT_LIMIT = 250;
const ZERO_COST_MAX_LIMIT = 500;

const PLAN_ENTITLEMENTS: Record<string, { allowedTabs: string[] }> = {
  starter: {
    allowedTabs: ["pos-tab", "floor-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "editor-tab", "kds-tab", "tokens-tab", "employees-tab", "growth-hub-tab", "customers-tab"],
  },
  growth: {
    allowedTabs: ROLE_DEFAULT_TABS.admin,
  },
  enterprise: {
    allowedTabs: ROLE_DEFAULT_TABS.admin,
  },
};

function activeSubscription(status: unknown) {
  return ["active", "trialing"].includes(String(status || "active"));
}

function effectiveTenantTabs(tenantTabs: unknown, planCode: unknown) {
  const planTabs = (PLAN_ENTITLEMENTS[String(planCode || "starter")] || PLAN_ENTITLEMENTS.starter).allowedTabs;
  return Array.isArray(tenantTabs) && tenantTabs.length > 0
    ? tenantTabs.map(String)
    : planTabs;
}

function effectiveTabs(role: string, userTabs: unknown, tenantTabs: unknown) {
  const roleTabs = ROLE_DEFAULT_TABS[role] || [];
  const requestedTabs = Array.isArray(userTabs) && userTabs.length > 0
    ? userTabs.map(String)
    : roleTabs;
  const enabledTenantTabs = Array.isArray(tenantTabs) ? tenantTabs.map(String) : [];
  return requestedTabs.filter((tab) => roleTabs.includes(tab) && enabledTenantTabs.includes(tab));
}

function jsonResponse(body: Record<string, unknown>, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : { "Access-Control-Allow-Origin": ALLOWED_ORIGIN }),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function broadcastTenantDataChange(tenantId: string, table: string, operation: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const topic = `rs-tenant-${tenantId}`;
  try {
    const response = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, "")}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/tenant-data-changed`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ table, operation, at: new Date().toISOString() }),
      },
    );
    if (!response.ok) {
      console.error("tenant-data realtime broadcast failed:", response.status, await response.text());
    }
  } catch (error) {
    console.error("tenant-data realtime broadcast error:", error);
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split("").map((char) => char.charCodeAt(0)));
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(signature));
}

// Constant-time string comparison — prevents timing side-channel attacks on
// HMAC signature comparison. A naive !== short-circuits on the first
// mismatched byte, leaking the expected signature one byte at a time.
function timingSafeEqualString(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getTenantPinResetHash(tenantId: string) {
  if (PIN_RESET_CODE_HASH) return PIN_RESET_CODE_HASH;

  const { data, error } = await supabaseAdmin
    .from("doppio_business_profile")
    .select("feature_flags")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("tenant-data PIN reset hash lookup failed:", error);
    return "";
  }

  try {
    const flags = typeof data?.feature_flags === "string"
      ? JSON.parse(data.feature_flags)
      : (data?.feature_flags || {});
    return String(
      flags.pin_reset_code_hash
      || flags.master_pin_reset_hash
      || flags.master_pin_hash
      || "",
    );
  } catch {
    return "";
  }
}

function getGatewayUrlAndToken() {
  let url = Deno.env.get("WHATSAPP_GATEWAY_URL") || "";
  const token = Deno.env.get("WHATSAPP_GATEWAY_TOKEN") || Deno.env.get("GATEWAY_TOKEN") || Deno.env.get("GATEWAY_AUTH_TOKEN") || Deno.env.get("EMAIL_RELAY_TOKEN") || "";

  if (!url) {
    url = "https://kalpeshdeora1006-restrosuite-gateway.hf.space";
  }

  url = url.trim().replace(/\/+$/, "");
  return { url, token: token.trim() };
}

async function proxyGatewayRequest(path: string, method: "GET" | "POST", req: Request, bodyData?: Record<string, unknown>, tenantId?: string) {
  const { url, token } = getGatewayUrlAndToken();
  const targetUrl = `${url}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  }
  if (tenantId) {
    headers["x-tenant-id"] = tenantId;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      return jsonResponse({ error: `Gateway returned status ${response.status}: ${text}` }, response.status, req);
    }

    const json = await response.json();
    return jsonResponse({ data: json }, 200, req);
  } catch (err: any) {
    console.error(`Gateway proxy error for ${targetUrl}:`, err);
    return jsonResponse({ error: `Failed to connect to gateway: ${err.message || err}` }, 502, req);
  }
}


async function verifyTenantSession(req: Request) {
  if (!SUPERADMIN_SESSION_SECRET) return { ok: false, error: "Session signing secret is not configured." };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { ok: false, error: "Missing tenant session token." };

  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return { ok: false, error: "Invalid session token." };

  const expectedSignature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (!timingSafeEqualString(expectedSignature, signature)) return { ok: false, error: "Invalid session token." };

  try {
    const payloadText = new TextDecoder().decode(decodeBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadText);
    if (!Object.hasOwn(ROLE_DEFAULT_TABS, String(payload.role || ""))) {
      return { ok: false, error: "Tenant session required." };
    }
    if (!payload.exp || Date.now() > Number(payload.exp)) return { ok: false, error: "Session expired. Please log in again." };

    const { data: tenant, error } = await supabaseAdmin
      .from("saas_tenants")
      .select("id, status, allowed_tabs, plan_code, subscription_status")
      .eq("id", String(payload.tenant_id || ""))
      .maybeSingle();

    if (error) {
      console.error("tenant-data session lookup failed:", error);
      return { ok: false, error: "Failed to validate tenant session." };
    }

    if (!tenant) return { ok: false, error: "Workspace no longer exists." };
    if (tenant.status !== "approved") return { ok: false, error: "Workspace access is not active." };
    if (!activeSubscription(tenant.subscription_status)) return { ok: false, error: "Workspace subscription is not active." };

    const tenantTabs = effectiveTenantTabs(tenant.allowed_tabs, tenant.plan_code);

    const userId = String(payload.user_id || "");
    if (userId) {
      const { data: staffUser, error: staffError } = await supabaseAdmin
        .from("tenant_users")
        .select("id, username, role, allowed_tabs, status, session_version")
        .eq("id", userId)
        .eq("tenant_id", tenant.id)
        .maybeSingle();

      if (staffError) {
        console.error("tenant-data staff session lookup failed:", staffError);
        return { ok: false, error: "Failed to validate staff session." };
      }
      if (!staffUser || staffUser.status !== "active") {
        return { ok: false, error: "Staff account is no longer active." };
      }
      if (
        Number(payload.session_version) !== Number(staffUser.session_version)
        || String(payload.role) !== staffUser.role
      ) {
        return { ok: false, error: "Session was revoked. Please log in again." };
      }

      return {
        ok: true,
        tenantId: tenant.id,
        allowedTabs: effectiveTabs(staffUser.role, staffUser.allowed_tabs, tenantTabs),
        actorUserId: staffUser.id,
        actorUsername: staffUser.username,
        actorRole: staffUser.role,
      };
    }

    if (payload.role !== "admin" || payload.legacy_owner !== true) {
      return { ok: false, error: "Invalid tenant session." };
    }

    return {
      ok: true,
      tenantId: tenant.id,
      allowedTabs: tenantTabs,
      actorUserId: null,
      actorUsername: String(payload.username || "owner"),
      actorRole: "admin",
    };
  } catch {
    return { ok: false, error: "Invalid session token." };
  }
}

function withTenantId(input: unknown, tenantId: string) {
  if (Array.isArray(input)) {
    return input.map((row) => ({ ...(row && typeof row === "object" ? row : {}), tenant_id: tenantId }));
  }
  return { ...(input && typeof input === "object" ? input as Record<string, unknown> : {}), tenant_id: tenantId };
}

function withoutTenantId(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const { tenant_id: _ignoredTenantId, ...safeInput } = input as Record<string, unknown>;
  return safeInput;
}

function applyFilters(query: any, filters: unknown[], tenantId: string) {
  let nextQuery = query.eq("tenant_id", tenantId);
  for (const filter of filters) {
    if (!filter || typeof filter !== "object") continue;
    const typed = filter as Record<string, unknown>;
    const column = String(typed.column || "");
    if (!column || column === "tenant_id") continue;
    if (typed.operator === "in" && Array.isArray(typed.value)) {
      nextQuery = nextQuery.in(column, typed.value);
    } else if (
      typed.operator === "not"
      && typed.comparisonOperator === "in"
      && typeof typed.value === "string"
    ) {
      nextQuery = nextQuery.not(column, "in", typed.value);
    } else {
      nextQuery = nextQuery.eq(column, typed.value);
    }
  }
  return nextQuery;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, req);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Tenant data backend is not configured." }, 500, req);
  }

  const verified = await verifyTenantSession(req);
  if (!verified.ok) return jsonResponse({ error: verified.error as string }, 401, req);

  try {
    const payload = await req.json();
    const table = String(payload.table || "");
    const operation = String(payload.operation || "");

    if (operation === "gateway_status") {
      return await proxyGatewayRequest("/status", "GET", req, undefined, verified.tenantId);
    }
    if (operation === "gateway_logout") {
      return await proxyGatewayRequest("/logout", "POST", req, undefined, verified.tenantId);
    }
    if (operation === "gateway_reset") {
      return await proxyGatewayRequest("/reset", "POST", req, undefined, verified.tenantId);
    }
    if (operation === "gateway_logs") {
      return await proxyGatewayRequest("/debug-logs?tenantId=" + encodeURIComponent(verified.tenantId), "GET", req, undefined, verified.tenantId);
    }
    if (operation === "gateway_send") {
      const phone = String(payload.phone || "");
      const message = String(payload.message || "");
      const orderId = String(payload.orderId || "");
      const pdfData = payload.pdfData ? String(payload.pdfData) : undefined;
      const filename = payload.filename ? String(payload.filename) : undefined;
      if (!phone || (!message && !pdfData)) {
        return jsonResponse({ error: "Missing phone or message/pdfData." }, 400, req);
      }
      return await proxyGatewayRequest("/send", "POST", req, { phone, message, orderId, pdfData, filename }, verified.tenantId);
    }

    if (operation === "verify_pin_reset_code") {
      const code = String(payload.code || "").trim();
      if (!/^[A-Za-z0-9_-]{6,64}$/.test(code)) {
        return jsonResponse({ valid: false, error: "Invalid reset code." }, 400, req);
      }

      const expectedHash = await getTenantPinResetHash(verified.tenantId as string);
      if (!expectedHash) {
        return jsonResponse({ valid: false, error: "PIN reset code is not configured for this outlet." }, 503, req);
      }

      const providedHash = await sha256Hex(code);
      if (!timingSafeEqualString(providedHash, expectedHash)) {
        return jsonResponse({ valid: false, error: "Invalid reset code." }, 403, req);
      }

      const { error: auditError } = await supabaseAdmin.from("tenant_audit_logs").insert({
        tenant_id: verified.tenantId,
        actor_user_id: verified.actorUserId,
        actor_username: verified.actorUsername,
        actor_role: verified.actorRole,
        action: "security.pin_reset_verified",
        target_type: "doppio_business_profile",
      });
      if (auditError) console.error("tenant-data PIN reset audit log failed:", auditError);

      return jsonResponse({ valid: true }, 200, req);
    }

    if (!TENANT_TABLES.has(table)) return jsonResponse({ error: "Table is not available through tenant data API." }, 400, req);

    const filters = Array.isArray(payload.filters) ? payload.filters : [];
    const columns = typeof payload.columns === "string" && payload.columns.trim() ? payload.columns : "*";

    const allowedTableTabs = TABLE_TAB_ACCESS[table];

    if (allowedTableTabs && !allowedTableTabs.some((tab) => (verified.allowedTabs as string[]).includes(tab))) {
      return jsonResponse({ error: "You do not have permission to access this module." }, 403, req);
    }
    if (
      operation !== "select"
      && verified.actorRole !== "admin"
      && verified.actorRole !== "manager"
      && !(TABLE_WRITE_ROLES[table] || []).includes(verified.actorRole as string)
    ) {
      return jsonResponse({ error: "Your role has read-only access to this module." }, 403, req);
    }

    let query: any;
    if (operation === "select") {
      query = applyFilters(supabaseAdmin.from(table).select(columns), filters, verified.tenantId as string);
      if (payload.order && typeof payload.order === "object") {
        const order = payload.order as Record<string, unknown>;
        query = query.order(String(order.column || "id"), { ascending: order.ascending !== false });
      }
      const requestedLimit = payload.limit !== null && payload.limit !== undefined ? Number(payload.limit) : NaN;
      const safeLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, ZERO_COST_MAX_LIMIT)
        : ZERO_COST_DEFAULT_LIMIT;
      query = query.limit(safeLimit);
      if (payload.single === true) query = query.single();
      if (payload.maybeSingle === true) query = query.maybeSingle();
    } else if (operation === "insert") {
      query = supabaseAdmin.from(table).insert(withTenantId(payload.data, verified.tenantId as string));
      if (payload.returning) query = query.select(columns);
    } else if (operation === "upsert") {
      const options = payload.options && typeof payload.options === "object" ? payload.options : {};
      const conflictColumns = String((options as Record<string, unknown>).onConflict || "")
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean);
      if (!conflictColumns.includes("tenant_id")) {
        return jsonResponse({ error: "Tenant upserts must use a tenant-scoped conflict key." }, 400, req);
      }
      query = supabaseAdmin.from(table).upsert(withTenantId(payload.data, verified.tenantId as string), options);
      if (payload.returning) query = query.select(columns);
    } else if (operation === "update") {
      const safeUpdate = withoutTenantId(payload.data);
      if (Object.keys(safeUpdate).length === 0) {
        return jsonResponse({ error: "No valid fields were provided for update." }, 400, req);
      }
      query = applyFilters(supabaseAdmin.from(table).update(safeUpdate), filters, verified.tenantId as string);
      if (payload.returning) query = query.select(columns);
    } else if (operation === "delete") {
      query = applyFilters(supabaseAdmin.from(table).delete(), filters, verified.tenantId as string);
    } else {
      return jsonResponse({ error: "Unsupported data operation." }, 400, req);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`tenant-data ${operation} failed for ${table}:`, error);
      return jsonResponse({ error: error.message || "Tenant data operation failed." }, 500, req);
    }

    if (operation !== "select") {
      const { error: auditError } = await supabaseAdmin.from("tenant_audit_logs").insert({
        tenant_id: verified.tenantId,
        actor_user_id: verified.actorUserId,
        actor_username: verified.actorUsername,
        actor_role: verified.actorRole,
        action: `data.${operation}`,
        target_type: table,
        metadata: {
          filters,
          returning: payload.returning === true,
        },
      });
      if (auditError) console.error("tenant-data audit log failed:", auditError);
      await broadcastTenantDataChange(verified.tenantId as string, table, operation);
    }

    return jsonResponse({ data }, 200, req);
  } catch (error) {
    console.error("tenant-data function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
