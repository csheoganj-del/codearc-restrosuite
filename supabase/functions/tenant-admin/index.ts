import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://codearc-restrosuite.vercel.app";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === ALLOWED_ORIGIN || origin.endsWith(".vercel.app") ? origin : ALLOWED_ORIGIN;
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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES_TO_RESET = [
  "doppio_bills",
  "doppio_pending_orders",
  "doppio_draft_orders",
  "doppio_menu",
  "doppio_inventory",
  "doppio_inventory_batches",
  "doppio_inventory_thresholds",
  "doppio_shifts",
  "doppio_shift_events",
  "doppio_employees",
  "doppio_leave_requests",
  "doppio_attendance",
  "doppio_crm",
  "doppio_notifications",
  "doppio_custom_recipes",
  "doppio_pos_popularity",
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
];

function jsonResponse(body: Record<string, unknown>, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? getCorsHeaders(req) : { "Access-Control-Allow-Origin": ALLOWED_ORIGIN }),
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

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomBase64Url(byteLength = 18) {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function hashPassword(password: string) {
  const iterations = 210000;
  const salt = randomBase64Url();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations,
    },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${salt}$${encodeBase64Url(new Uint8Array(derived))}`;
}

async function verifySuperadminToken(req: Request) {
  if (!SUPERADMIN_SESSION_SECRET) return { ok: false, error: "Superadmin session secret is not configured." };

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { ok: false, error: "Missing superadmin session token." };

  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return { ok: false, error: "Invalid session token." };

  const expectedSignature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (expectedSignature !== signature) return { ok: false, error: "Invalid session token." };

  try {
    const payloadText = new TextDecoder().decode(decodeBase64Url(payloadEncoded));
    const payload = JSON.parse(payloadText);
    if (payload.role !== "superadmin") return { ok: false, error: "Insufficient privileges." };
    if (!payload.exp || Date.now() > Number(payload.exp)) return { ok: false, error: "Session expired. Please log in again." };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid session token." };
  }
}

async function listTenants(req: Request) {
  const { data, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, outlet_type, email, phone, username, status, allowed_tabs, plan_code, subscription_status, subscription_current_period_end, created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    console.error("list_tenants failed:", error);
    return jsonResponse({ error: "Failed to load client workspaces." }, 500, req);
  }

  return jsonResponse({ tenants: data || [] }, 200, req);
}

async function listErrorReports(payload: Record<string, unknown>, req: Request) {
  const requestedLimit = Math.min(Math.max(Number(payload.limit) || 50, 1), 100);
  let query = supabaseAdmin
    .from("app_error_reports")
    .select("id, tenant_id, tenant_slug, severity, source, message, stack, url_path, app_version, user_agent, metadata, status, resolved_at, created_at")
    .order("created_at", { ascending: false })
    .limit(requestedLimit);
  if (payload.status === "open" || payload.status === "resolved") {
    query = query.eq("status", payload.status);
  }
  const { data, error } = await query;
  if (error) {
    console.error("list_error_reports failed:", error);
    return jsonResponse({ error: "Failed to load application incidents." }, 500, req);
  }
  return jsonResponse({ reports: data || [] }, 200, req);
}

async function resolveErrorReport(payload: Record<string, unknown>, req: Request) {
  const reportId = Number(payload.report_id);
  if (!Number.isInteger(reportId) || reportId <= 0) {
    return jsonResponse({ error: "Valid report ID is required." }, 400, req);
  }
  const { error } = await supabaseAdmin
    .from("app_error_reports")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", reportId);
  if (error) {
    console.error("resolve_error_report failed:", error);
    return jsonResponse({ error: "Failed to resolve incident." }, 500, req);
  }
  return jsonResponse({ success: true }, 200, req);
}

async function bulkDelete(payload: Record<string, unknown>, req: Request) {
  const tenantIds = Array.isArray(payload.tenant_ids) ? payload.tenant_ids.map(String).filter(Boolean) : [];
  if (tenantIds.length === 0) return jsonResponse({ error: "No tenant IDs provided." }, 400, req);

  const { error } = await supabaseAdmin.from("saas_tenants").delete().in("id", tenantIds);
  if (error) {
    console.error("bulk_delete failed:", error);
    return jsonResponse({ error: "Failed to delete selected accounts." }, 500, req);
  }
  return jsonResponse({ success: true, deleted_count: tenantIds.length }, 200, req);
}

async function deleteTenant(payload: Record<string, unknown>, req: Request) {
  const tenantId = String(payload.tenant_id || "").trim();
  if (!tenantId) return jsonResponse({ error: "Tenant ID is required." }, 400, req);

  const { error } = await supabaseAdmin.from("saas_tenants").delete().eq("id", tenantId);
  if (error) {
    console.error("delete_tenant failed:", error);
    return jsonResponse({ error: "Failed to delete account." }, 500, req);
  }
  return jsonResponse({ success: true }, 200, req);
}

async function updateTenant(payload: Record<string, unknown>, req: Request) {
  const tenantId = String(payload.tenant_id || "").trim();
  if (!tenantId) return jsonResponse({ error: "Tenant ID is required." }, 400, req);

  const updates: Record<string, unknown> = {};
  if (typeof payload.username === "string") updates.username = payload.username.trim();
  if (typeof payload.status === "string") updates.status = payload.status.trim();
  if (Array.isArray(payload.allowed_tabs)) updates.allowed_tabs = payload.allowed_tabs.map(String);
  if (typeof payload.plan_code === "string" && ["starter", "growth", "enterprise"].includes(payload.plan_code)) {
    updates.plan_code = payload.plan_code;
  }
  if (
    typeof payload.subscription_status === "string"
    && ["trialing", "active", "past_due", "canceled"].includes(payload.subscription_status)
  ) {
    updates.subscription_status = payload.subscription_status;
  }
  if (typeof payload.subscription_current_period_end === "string") {
    const periodEnd = payload.subscription_current_period_end.trim();
    updates.subscription_current_period_end = periodEnd ? periodEnd : null;
  }
  if (typeof payload.phone === "string") updates.phone = payload.phone.trim();
  if (typeof payload.email === "string") updates.email = payload.email.trim().toLowerCase();

  if (typeof payload.password === "string" && payload.password.trim() !== "") {
    if (payload.password.length < 10) {
      return jsonResponse({ error: "Password must be at least 10 characters." }, 400, req);
    }
    updates.password_hash = await hashPassword(payload.password);
  }

  const { error } = await supabaseAdmin.from("saas_tenants").update(updates).eq("id", tenantId);
  if (error) {
    console.error("update_tenant failed:", error);
    return jsonResponse({ error: "Failed to save settings." }, 500, req);
  }
  return jsonResponse({ success: true }, 200, req);
}

async function resetTenantData(payload: Record<string, unknown>, req: Request) {
  const tenantId = String(payload.tenant_id || "").trim();
  if (!tenantId) return jsonResponse({ error: "Tenant ID is required." }, 400, req);

  const errors: string[] = [];
  for (const table of TABLES_TO_RESET) {
    const { error } = await supabaseAdmin.from(table).delete().eq("tenant_id", tenantId);
    if (error) {
      console.warn(`Failed to reset table ${table}:`, error.message);
      errors.push(table);
    }
  }

  let existingFlags: Record<string, unknown> = {};
  try {
    const { data: existingProfile } = await supabaseAdmin
      .from("doppio_business_profile")
      .select("feature_flags")
      .eq("tenant_id", tenantId)
      .single();

    if (existingProfile?.feature_flags) {
      existingFlags = typeof existingProfile.feature_flags === "string"
        ? JSON.parse(existingProfile.feature_flags)
        : existingProfile.feature_flags;
    }
  } catch {
    existingFlags = {};
  }

  existingFlags.seeding_disabled = true;

  const { error: profileError } = await supabaseAdmin
    .from("doppio_business_profile")
    .update({
      business_name: "",
      address: "",
      phone: "",
      gst_number: "",
      upi_id: "",
      logo_base64: null,
      shift_enabled: false,
      whatsapp_enabled: false,
      table_count: 10,
      feature_flags: JSON.stringify(existingFlags),
    })
    .eq("tenant_id", tenantId);

  if (profileError) {
    console.warn("Failed to reset business profile:", profileError.message);
    errors.push("doppio_business_profile");
  }

  const resetAt = new Date().toISOString();
  const { error: markerError } = await supabaseAdmin
    .from("saas_tenants")
    .update({ data_reset_at: resetAt })
    .eq("id", tenantId);

  if (markerError) {
    console.warn("Failed to update tenant reset marker:", markerError.message);
    errors.push("saas_tenants.data_reset_at");
  }

  return jsonResponse({ success: true, errors, data_reset_at: resetAt }, 200, req);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, req);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Tenant admin backend is not configured." }, 500, req);
  }

  const verified = await verifySuperadminToken(req);
  if (!verified.ok) {
    return jsonResponse({ error: verified.error as string }, 401, req);
  }

  try {
    const payload = await req.json();
    const action = String(payload?.action || "");

    if (action === "list_tenants") return await listTenants(req);
    if (action === "list_error_reports") return await listErrorReports(payload, req);
    if (action === "resolve_error_report") return await resolveErrorReport(payload, req);
    if (action === "bulk_delete") return await bulkDelete(payload, req);
    if (action === "delete_tenant") return await deleteTenant(payload, req);
    if (action === "update_tenant") return await updateTenant(payload, req);
    if (action === "reset_tenant_data") return await resetTenantData(payload, req);

    return jsonResponse({ error: "Unsupported action." }, 400, req);
  } catch (error) {
    console.error("tenant-admin function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
