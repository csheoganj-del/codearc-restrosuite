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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PLAN_ENTITLEMENTS: Record<string, { name: string; allowedTabs: string[] }> = {
  free: {
    name: "Free / Demo",
    allowedTabs: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "editor-tab", "kds-tab", "tokens-tab"],
  },
  starter: {
    name: "Starter",
    allowedTabs: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "editor-tab", "kds-tab", "tokens-tab", "employees-tab", "growth-hub-tab"],
  },
  growth: {
    name: "Growth",
    allowedTabs: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "reports-tab", "editor-tab", "crm-tab", "tax-tab", "online-tab", "kds-tab", "tokens-tab", "employees-tab", "growth-hub-tab"],
  },
  enterprise: {
    name: "Enterprise",
    allowedTabs: ["pos-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "reports-tab", "editor-tab", "crm-tab", "tax-tab", "online-tab", "kds-tab", "tokens-tab", "employees-tab", "growth-hub-tab"],
  },
};

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

async function createSignedSessionToken(payload: Record<string, unknown>) {
  if (!SUPERADMIN_SESSION_SECRET) return null;
  const payloadEncoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
    ...payload,
    exp: Date.now() + (2 * 60 * 60 * 1000),
  })));
  const signature = await signValue(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  return `${payloadEncoded}.${signature}`;
}

function planFor(code: unknown) {
  return PLAN_ENTITLEMENTS[String(code || "starter")] || PLAN_ENTITLEMENTS.starter;
}

function effectiveTenantTabs(tenantTabs: unknown, planCode: unknown) {
  const planTabs = planFor(planCode).allowedTabs;
  return Array.isArray(tenantTabs) && tenantTabs.length > 0
    ? tenantTabs.map(String)
    : planTabs;
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
  if (!timingSafeEqualString(expectedSignature, signature)) return { ok: false, error: "Invalid session token." };

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

function getGatewayUrlAndToken() {
  let url = Deno.env.get("WHATSAPP_GATEWAY_URL") || "";
  const token = Deno.env.get("WHATSAPP_GATEWAY_TOKEN") || Deno.env.get("GATEWAY_TOKEN") || Deno.env.get("GATEWAY_AUTH_TOKEN") || Deno.env.get("EMAIL_RELAY_TOKEN") || "";

  if (!url) {
    const relayUrl = Deno.env.get("EMAIL_RELAY_URL") || "";
    if (relayUrl && !relayUrl.includes("script.google.com")) {
      try {
        const parsed = new URL(relayUrl);
        url = parsed.origin;
      } catch (_) {
        // Ignored
      }
    }
  }

  if (!url) {
    url = "https://kalpeshdeora1006-whatsapp-gateway.hf.space";
  }

  url = url.trim().replace(/\/+$/, "");
  return { url, token: token.trim() };
}

async function proxyGatewayRequest(path: string, method: "GET" | "POST", req: Request) {
  const { url, token } = getGatewayUrlAndToken();
  const targetUrl = `${url}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(targetUrl, {
      method,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      return jsonResponse({ error: `Gateway returned status ${response.status}: ${text}` }, response.status, req);
    }

    const json = await response.json();
    return jsonResponse(json, 200, req);
  } catch (err: any) {
    console.error(`Gateway proxy error for ${targetUrl}:`, err);
    return jsonResponse({ error: `Failed to connect to gateway: ${err.message || err}` }, 502, req);
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
  const { data: currentTenant, error: currentTenantError } = await supabaseAdmin
    .from("saas_tenants")
    .select("username, auth_version")
    .eq("id", tenantId)
    .maybeSingle();
  if (currentTenantError || !currentTenant) {
    return jsonResponse({ error: "Client workspace was not found." }, 404, req);
  }

  const updates: Record<string, unknown> = {};
  if (typeof payload.username === "string") updates.username = payload.username.trim();
  if (typeof payload.status === "string") updates.status = payload.status.trim();
  if (Array.isArray(payload.allowed_tabs)) updates.allowed_tabs = payload.allowed_tabs.map(String);
  if (typeof payload.plan_code === "string" && ["free", "starter", "growth", "enterprise"].includes(payload.plan_code)) {
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
    updates.auth_version = Number(currentTenant.auth_version || 1) + 1;
  }

  let migratedOwner = null;
  if (
    (typeof payload.username === "string" && payload.username.trim())
    || (typeof payload.password === "string" && payload.password.trim() !== "")
  ) {
    const { data } = await supabaseAdmin
      .from("tenant_users")
      .select("id, session_version")
      .eq("tenant_id", tenantId)
      .eq("username_normalized", String(currentTenant.username || "").trim().toLowerCase())
      .eq("role", "admin")
      .maybeSingle();
    migratedOwner = data;
  }

  const { error } = await supabaseAdmin.from("saas_tenants").update(updates).eq("id", tenantId);
  if (error) {
    console.error("update_tenant failed:", error);
    return jsonResponse({ error: "Failed to save settings." }, 500, req);
  }

  const migratedOwnerUpdates: Record<string, unknown> = {};
  if (typeof payload.username === "string" && payload.username.trim()) {
    migratedOwnerUpdates.username = payload.username.trim();
    migratedOwnerUpdates.username_normalized = payload.username.trim().toLowerCase();
  }
  if (typeof payload.password === "string" && payload.password.trim() !== "") {
    migratedOwnerUpdates.password_hash = await hashPassword(payload.password);
    migratedOwnerUpdates.session_version = Number(migratedOwner?.session_version || 1) + 1;
    migratedOwnerUpdates.updated_at = new Date().toISOString();
  }
  if (migratedOwner && Object.keys(migratedOwnerUpdates).length > 0) {
    const { error: ownerError } = await supabaseAdmin
      .from("tenant_users")
      .update(migratedOwnerUpdates)
      .eq("id", migratedOwner.id);
    if (ownerError) {
      console.error("migrated owner credential update failed:", ownerError);
      return jsonResponse({ error: "Workspace updated, but migrated owner credentials could not be synchronized." }, 500, req);
    }
  }
  return jsonResponse({ success: true }, 200, req);
}

async function createImpersonationSession(payload: Record<string, unknown>, req: Request, verifiedPayload: Record<string, unknown>) {
  const tenantId = String(payload.tenant_id || "").trim();
  if (!tenantId) return jsonResponse({ error: "Tenant ID is required." }, 400, req);

  const { data: tenant, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, slug, username, status, allowed_tabs, data_reset_at, plan_code, subscription_status, subscription_current_period_end, auth_version")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("create_impersonation_session lookup failed:", error);
    return jsonResponse({ error: "Failed to load workspace." }, 500, req);
  }
  if (!tenant) return jsonResponse({ error: "Client workspace was not found." }, 404, req);
  if (tenant.status !== "approved") return jsonResponse({ error: "Only active workspaces can be opened." }, 403, req);
  if (!["active", "trialing"].includes(String(tenant.subscription_status || "active"))) {
    return jsonResponse({ error: "Workspace subscription is not active." }, 402, req);
  }

  const actor = String(verifiedPayload.username || "superadmin");
  const sessionToken = await createSignedSessionToken({
    role: "admin",
    username: `superadmin:${actor}`,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    legacy_owner: true,
    auth_version: tenant.auth_version,
    impersonated_by: actor,
  });

  if (!sessionToken) {
    return jsonResponse({ error: "Authentication service is misconfigured: session signing secret is missing." }, 500, req);
  }

  const plan = planFor(tenant.plan_code);
  const allowedTabs = effectiveTenantTabs(tenant.allowed_tabs, tenant.plan_code);

  const { error: auditError } = await supabaseAdmin.from("tenant_audit_logs").insert({
    tenant_id: tenant.id,
    actor_user_id: null,
    actor_username: actor,
    actor_role: "superadmin",
    action: "superadmin.impersonation.start",
    target_type: "saas_tenants",
    target_id: tenant.id,
    metadata: { tenant_slug: tenant.slug },
  });
  if (auditError) console.error("impersonation audit log failed:", auditError);

  return jsonResponse({
    session: {
      username: `superadmin:${actor}`,
      display_name: `Support: ${actor}`,
      role: "admin",
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      allowed_tabs: allowedTabs,
      data_reset_at: tenant.data_reset_at || null,
      plan_code: tenant.plan_code || "starter",
      plan_name: plan.name,
      subscription_status: tenant.subscription_status || "active",
      subscription_current_period_end: tenant.subscription_current_period_end || null,
      session_token: sessionToken,
      impersonated_by: actor,
    },
  }, 200, req);
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

async function seedTenantData(payload: Record<string, unknown>, req: Request) {
  const tenantId = String(payload.tenant_id || "").trim();
  if (!tenantId) return jsonResponse({ error: "Tenant ID is required." }, 400, req);

  // 1. Check if tenant exists
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, phone, country")
    .eq("id", tenantId)
    .maybeSingle();

  if (tenantError || !tenant) {
    return jsonResponse({ error: "Client workspace was not found." }, 404, req);
  }

  // 2. Clear existing operational data first to prevent duplicate key conflicts
  const errors: string[] = [];
  for (const table of TABLES_TO_RESET) {
    const { error } = await supabaseAdmin.from(table).delete().eq("tenant_id", tenantId);
    if (error) {
      console.warn(`Failed to clear table ${table} before seeding:`, error.message);
      errors.push(table);
    }
  }

  const isIreland = tenant.country === "Ireland";
  const defaultAddress = isIreland ? "Dublin, Ireland" : "12, Commercial Road, Nagpur";
  const defaultPhone = tenant.phone || (isIreland ? "353871234567" : "919983721179");
  const defaultGstNumber = isIreland ? "" : "27AAAAA1111A1Z1";
  const defaultUpiId = isIreland ? "" : "doppio@upi";

  const defaultUiSettings = {
    set_country: tenant.country || (isIreland ? "Ireland" : "India"),
    set_currency: isIreland ? "EUR (€)" : "INR (₹)"
  };

  const featureFlags = {
    seeding_disabled: true,
    demo_loaded: true,
    ui_settings: defaultUiSettings
  };

  // 3. Seed doppio_business_profile
  await supabaseAdmin.from("doppio_business_profile").insert({
    tenant_id: tenantId,
    business_name: tenant.name,
    address: defaultAddress,
    phone: defaultPhone,
    gst_number: defaultGstNumber,
    upi_id: defaultUpiId,
    shift_enabled: true,
    whatsapp_enabled: false,
    table_count: 12,
    feature_flags: JSON.stringify(featureFlags)
  });

  // 4. Seed doppio_menu
  const menuItems = [
    { name: "Doppio", price: 120, category: "Hot coffee", available: true, popularity: 45 },
    { name: "Espresso", price: 100, category: "Hot coffee", available: true, popularity: 30 },
    { name: "Cappuccino", price: 150, category: "Hot coffee", available: true, popularity: 85 },
    { name: "Cafe Latte", price: 160, category: "Hot coffee", available: true, popularity: 70 },
    { name: "Iced Americano", price: 140, category: "Iced coffee", available: true, popularity: 50 },
    { name: "Chocolate Brownie", price: 180, category: "Dessert", available: true, popularity: 90 }
  ];
  const { data: menuData, error: menuErr } = await supabaseAdmin
    .from("doppio_menu")
    .insert(menuItems.map(({ popularity, ...item }) => ({ ...item, tenant_id: tenantId })))
    .select();

  if (menuErr) {
    console.error("Seeding menu failed:", menuErr);
    return jsonResponse({ error: "Failed to seed menu items: " + menuErr.message }, 500, req);
  }

  // 5. Seed doppio_inventory
  const stockItems = [
    { key: "espresso_coffee_beans", label: "Espresso Coffee Beans", unit: "g", current: 5000, max_stock: 10000, category: "food" },
    { key: "fresh_milk", label: "Fresh Milk", unit: "ml", current: 10000, max_stock: 20000, category: "food" },
    { key: "chocolate_syrup", label: "Chocolate Syrup", unit: "ml", current: 2000, max_stock: 5000, category: "food" },
    { key: "sugar_syrup", label: "Sugar Syrup", unit: "ml", current: 3000, max_stock: 5000, category: "food" },
    { key: "paper_cups_250ml", label: "Paper Cups 250ml", unit: "pcs", current: 500, max_stock: 1000, category: "packaging" }
  ];

  const { data: invData, error: invErr } = await supabaseAdmin
    .from("doppio_inventory")
    .insert(stockItems.map(item => ({ ...item, tenant_id: tenantId })))
    .select();

  if (invErr) {
    console.error("Seeding inventory failed:", invErr);
    return jsonResponse({ error: "Failed to seed inventory: " + invErr.message }, 500, req);
  }

  // Seed doppio_inventory_thresholds
  const thresholds = [
    { ingredient_key: "espresso_coffee_beans", threshold: 1000 },
    { ingredient_key: "fresh_milk", threshold: 2000 },
    { ingredient_key: "chocolate_syrup", threshold: 500 },
    { ingredient_key: "sugar_syrup", threshold: 500 },
    { ingredient_key: "paper_cups_250ml", threshold: 100 }
  ];
  await supabaseAdmin.from("doppio_inventory_thresholds").insert(thresholds.map(t => ({ ...t, tenant_id: tenantId })));

  // 6. Seed doppio_inventory_batches (for FEFO and batch costing)
  let batchIds: any[] = [];
  const batchInserts = stockItems.map(item => ({
    id: "batch_" + item.key + "_" + Math.floor(1000 + Math.random() * 9000),
    tenant_id: tenantId,
    ingredient_key: item.key,
    qty: item.current,
    expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    receivedDate: new Date().toISOString().split('T')[0]
  }));
  const { data: batchData, error: batchErr } = await supabaseAdmin.from("doppio_inventory_batches").insert(batchInserts).select();
  if (batchErr) {
    console.warn("Seeding inventory batches failed:", batchErr);
  }
  batchIds = batchData ? batchData.map((r: any) => r.id) : [];

  // 7. Seed doppio_custom_recipes
  let recipeIds: any[] = [];
  const recipes = [
    {
      item_name: "Doppio",
      ingredients: { espresso_coffee_beans: 18, paper_cups_250ml: 1 }
    },
    {
      item_name: "Espresso",
      ingredients: { espresso_coffee_beans: 9, paper_cups_250ml: 1 }
    },
    {
      item_name: "Cappuccino",
      ingredients: { espresso_coffee_beans: 9, fresh_milk: 150, paper_cups_250ml: 1 }
    },
    {
      item_name: "Cafe Latte",
      ingredients: { espresso_coffee_beans: 9, fresh_milk: 200, paper_cups_250ml: 1 }
    }
  ];
  const { data: recipeData, error: recipeErr } = await supabaseAdmin.from("doppio_custom_recipes").insert(recipes.map(r => ({
    tenant_id: tenantId,
    item_name: r.item_name,
    ingredients: r.ingredients
  }))).select();
  if (recipeErr) {
    console.warn("Seeding custom recipes failed:", recipeErr);
  }
  recipeIds = recipeData ? recipeData.map((r: any) => r.id) : [];

  // 8. Seed doppio_employees
  const employees = [
    { name: "Amit Sharma", role: "cashier", salary: 15000, shift: "Morning Shift (09:00 - 17:00)", status: "active" },
    { name: "Rajesh Verma", role: "kitchen", salary: 22000, shift: "Morning Shift (09:00 - 17:00)", status: "active" },
    { name: "Pooja Patel", role: "waiter", salary: 12000, shift: "Evening Shift (17:00 - 01:00)", status: "active" }
  ];
  const { data: empData } = await supabaseAdmin.from("doppio_employees").insert(employees.map(e => ({ ...e, tenant_id: tenantId }))).select();
  const employeeIds = empData ? empData.map((r: any) => r.id) : [];

  // 9. Seed doppio_bills
  let billIds: any[] = [];
  if (menuData) {
    const bills = [];
    const paymentModes = ["Cash", "UPI", "Card"];
    for (let i = 7; i >= 1; i--) {
      const count = Math.floor(2 + Math.random() * 2);
      for (let j = 0; j < count; j++) {
        const item1 = menuData[Math.floor(Math.random() * menuData.length)];
        const item2 = menuData[Math.floor(Math.random() * menuData.length)];
        const qty1 = Math.floor(1 + Math.random() * 2);
        const qty2 = Math.floor(1 + Math.random() * 2);

        const itemsSold = [
          { name: item1.name, price: item1.price, quantity: qty1, subtotal: item1.price * qty1 },
          { name: item2.name, price: item2.price, quantity: qty2, subtotal: item2.price * qty2 }
        ];
        const subtotal = (item1.price * qty1) + (item2.price * qty2);
        const gst = Math.round(subtotal * 0.05);
        const grandTotal = subtotal + gst;

        const billDate = new Date(Date.now() - i * 24 * 60 * 60 * 1000 + j * 2 * 60 * 60 * 1000);

        bills.push({
          tenant_id: tenantId,
          bill_date: billDate.toISOString(),
          items: JSON.stringify(itemsSold),
          subtotal,
          discount: 0,
          gst,
          grand_total: grandTotal,
          payment_mode: paymentModes[Math.floor(Math.random() * paymentModes.length)],
          table_number: String(Math.floor(1 + Math.random() * 10)),
          order_type: Math.random() > 0.3 ? "dine-in" : "takeaway",
          settled: true
        });
      }
    }
    const { data: billData } = await supabaseAdmin.from("doppio_bills").insert(bills).select();
    billIds = billData ? billData.map((r: any) => r.id) : [];
  }

  // 10. Update doppio_business_profile feature_flags with the list of seeded record IDs
  const demoDataIds = {
    menu: menuData ? menuData.map((r: any) => r.id) : [],
    inventory: invData ? invData.map((r: any) => r.id) : [],
    inventory_batches: batchIds,
    recipes: recipeIds,
    employees: employeeIds,
    bills: billIds
  };

  await supabaseAdmin
    .from("doppio_business_profile")
    .update({
      feature_flags: JSON.stringify({
        seeding_disabled: true,
        demo_loaded: true,
        demo_data_ids: demoDataIds
      })
    })
    .eq("tenant_id", tenantId);

  return jsonResponse({ success: true }, 200, req);
}

async function purgeTenantDemoData(payload: Record<string, unknown>, req: Request) {
  const tenantId = String(payload.tenant_id || "").trim();
  if (!tenantId) return jsonResponse({ error: "Tenant ID is required." }, 400, req);

  // 1. Fetch feature flags from doppio_business_profile
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("doppio_business_profile")
    .select("feature_flags")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (profileErr || !profile) {
    return jsonResponse({ error: "Client business profile was not found." }, 404, req);
  }

  let flags: Record<string, any> = {};
  try {
    flags = typeof profile.feature_flags === "string"
      ? JSON.parse(profile.feature_flags)
      : profile.feature_flags || {};
  } catch {
    flags = {};
  }

  const demoDataIds = flags.demo_data_ids;
  if (!demoDataIds) {
    return jsonResponse({ error: "No recorded demo data found to remove. Use 'Reset data' to fully reset the workspace." }, 400, req);
  }

  const errors: string[] = [];

  // Delete from all tables based on IDs
  if (Array.isArray(demoDataIds.bills) && demoDataIds.bills.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_bills").delete().in("id", demoDataIds.bills);
    if (error) {
      console.warn("Failed to delete demo bills:", error.message);
      errors.push("doppio_bills");
    }
  }
  if (Array.isArray(demoDataIds.recipes) && demoDataIds.recipes.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_custom_recipes").delete().in("id", demoDataIds.recipes);
    if (error) {
      console.warn("Failed to delete demo recipes:", error.message);
      errors.push("doppio_custom_recipes");
    }
  }
  if (Array.isArray(demoDataIds.inventory_batches) && demoDataIds.inventory_batches.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_inventory_batches").delete().in("id", demoDataIds.inventory_batches);
    if (error) {
      console.warn("Failed to delete demo inventory batches:", error.message);
      errors.push("doppio_inventory_batches");
    }
  }
  if (Array.isArray(demoDataIds.inventory) && demoDataIds.inventory.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_inventory").delete().in("id", demoDataIds.inventory);
    if (error) {
      console.warn("Failed to delete demo inventory:", error.message);
      errors.push("doppio_inventory");
    }
  }
  if (Array.isArray(demoDataIds.employees) && demoDataIds.employees.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_employees").delete().in("id", demoDataIds.employees);
    if (error) {
      console.warn("Failed to delete demo employees:", error.message);
      errors.push("doppio_employees");
    }
  }
  if (Array.isArray(demoDataIds.menu) && demoDataIds.menu.length > 0) {
    const { error } = await supabaseAdmin.from("doppio_menu").delete().in("id", demoDataIds.menu);
    if (error) {
      console.warn("Failed to delete demo menu items:", error.message);
      errors.push("doppio_menu");
    }
  }

  // Update profile feature flags
  delete flags.demo_data_ids;
  flags.demo_loaded = false;

  const { error: updateProfileErr } = await supabaseAdmin
    .from("doppio_business_profile")
    .update({ feature_flags: JSON.stringify(flags) })
    .eq("tenant_id", tenantId);

  if (updateProfileErr) {
    console.warn("Failed to update profile feature flags:", updateProfileErr.message);
    errors.push("doppio_business_profile");
  }

  if (errors.length > 0) {
    return jsonResponse({ error: "Failed to purge demo data from tables: " + errors.join(", ") }, 500, req);
  }

  return jsonResponse({ success: true }, 200, req);
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
    if (action === "create_impersonation_session") return await createImpersonationSession(payload, req, verified.payload as Record<string, unknown>);
    if (action === "reset_tenant_data") return await resetTenantData(payload, req);
    if (action === "seed_tenant_data") return await seedTenantData(payload, req);
    if (action === "purge_demo_data") return await purgeTenantDemoData(payload, req);
    if (action === "gateway_status") return await proxyGatewayRequest("/status", "GET", req);
    if (action === "gateway_logs") return await proxyGatewayRequest("/debug-logs", "GET", req);
    if (action === "gateway_reset") return await proxyGatewayRequest("/reset", "POST", req);

    return jsonResponse({ error: "Unsupported action." }, 400, req);
  } catch (error) {
    console.error("tenant-admin function error:", error);
    return jsonResponse({ error: "Unexpected server error." }, 500, req);
  }
});
