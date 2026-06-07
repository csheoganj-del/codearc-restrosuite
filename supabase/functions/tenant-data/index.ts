import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPERADMIN_SESSION_SECRET = Deno.env.get("SUPERADMIN_SESSION_SECRET") || "";

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
]);

const TABLE_TAB_ACCESS: Record<string, string[]> = {
  doppio_menu: ["pos-tab", "editor-tab", "online-tab"],
  doppio_inventory: ["pos-tab", "inventory-tab", "editor-tab"],
  doppio_inventory_batches: ["pos-tab", "inventory-tab"],
  doppio_inventory_thresholds: ["pos-tab", "inventory-tab"],
  doppio_bills: ["pos-tab", "bills-tab", "reports-tab", "tax-tab"],
  doppio_pending_orders: ["pos-tab", "qr-orders-tab", "kds-tab", "tokens-tab", "online-tab"],
  doppio_shifts: ["pos-tab", "employees-tab"],
  doppio_shift_events: ["pos-tab", "employees-tab"],
  doppio_employees: ["employees-tab"],
  doppio_leave_requests: ["employees-tab"],
  doppio_attendance: ["employees-tab"],
  doppio_crm: ["pos-tab", "crm-tab"],
  doppio_notifications: ["pos-tab", "qr-orders-tab", "inventory-tab", "employees-tab"],
  doppio_custom_recipes: ["pos-tab", "editor-tab"],
  doppio_pos_popularity: ["pos-tab", "reports-tab"],
  doppio_draft_orders: ["pos-tab"],
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
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

async function verifyTenantSession(req: Request) {
  if (!SUPERADMIN_SESSION_SECRET) return { ok: false, error: "Session signing secret is not configured." };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { ok: false, error: "Missing tenant session token." };

  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return { ok: false, error: "Invalid session token." };

  const expectedSignature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (expectedSignature !== signature) return { ok: false, error: "Invalid session token." };

  try {
    const payloadText = new TextDecoder().decode(decodeBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadText);
    if (payload.role !== "admin") return { ok: false, error: "Tenant session required." };
    if (!payload.exp || Date.now() > Number(payload.exp)) return { ok: false, error: "Session expired. Please log in again." };

    const { data: tenant, error } = await supabaseAdmin
      .from("saas_tenants")
      .select("id, status, allowed_tabs")
      .eq("id", String(payload.tenant_id || ""))
      .maybeSingle();

    if (error) {
      console.error("tenant-data session lookup failed:", error);
      return { ok: false, error: "Failed to validate tenant session." };
    }

    if (!tenant) return { ok: false, error: "Workspace no longer exists." };
    if (tenant.status !== "approved") return { ok: false, error: "Workspace access is not active." };

    return {
      ok: true,
      tenantId: tenant.id,
      allowedTabs: Array.isArray(tenant.allowed_tabs) ? tenant.allowed_tabs : [],
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
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Tenant data backend is not configured." }, 500);
  }

  const verified = await verifyTenantSession(req);
  if (!verified.ok) return jsonResponse({ error: verified.error as string }, 401);

  try {
    const payload = await req.json();
    const table = String(payload.table || "");
    const operation = String(payload.operation || "");
    const filters = Array.isArray(payload.filters) ? payload.filters : [];
    const columns = typeof payload.columns === "string" && payload.columns.trim() ? payload.columns : "*";

    if (!TENANT_TABLES.has(table)) return jsonResponse({ error: "Table is not available through tenant data API." }, 400);

    const allowedTableTabs = TABLE_TAB_ACCESS[table];
    if (allowedTableTabs && !allowedTableTabs.some((tab) => (verified.allowedTabs as string[]).includes(tab))) {
      return jsonResponse({ error: "You do not have permission to access this module." }, 403);
    }

    let query: any;
    if (operation === "select") {
      query = applyFilters(supabaseAdmin.from(table).select(columns), filters, verified.tenantId as string);
      if (payload.order && typeof payload.order === "object") {
        const order = payload.order as Record<string, unknown>;
        query = query.order(String(order.column || "id"), { ascending: order.ascending !== false });
      }
      if (Number.isFinite(Number(payload.limit))) query = query.limit(Number(payload.limit));
      if (payload.single === true) query = query.single();
      if (payload.maybeSingle === true) query = query.maybeSingle();
    } else if (operation === "insert") {
      query = supabaseAdmin.from(table).insert(withTenantId(payload.data, verified.tenantId as string));
      if (payload.returning) query = query.select(columns);
    } else if (operation === "upsert") {
      const options = payload.options && typeof payload.options === "object" ? payload.options : {};
      query = supabaseAdmin.from(table).upsert(withTenantId(payload.data, verified.tenantId as string), options);
      if (payload.returning) query = query.select(columns);
    } else if (operation === "update") {
      query = applyFilters(supabaseAdmin.from(table).update(payload.data || {}), filters, verified.tenantId as string);
      if (payload.returning) query = query.select(columns);
    } else if (operation === "delete") {
      query = applyFilters(supabaseAdmin.from(table).delete(), filters, verified.tenantId as string);
    } else {
      return jsonResponse({ error: "Unsupported data operation." }, 400);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`tenant-data ${operation} failed for ${table}:`, error);
      return jsonResponse({ error: error.message || "Tenant data operation failed." }, 500);
    }

    return jsonResponse({ data });
  } catch (error) {
    console.error("tenant-data function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500);
  }
});
