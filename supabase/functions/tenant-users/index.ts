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
const SESSION_SECRET = Deno.env.get("SUPERADMIN_SESSION_SECRET") || "";
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROLE_DEFAULT_TABS: Record<string, string[]> = {
  admin: [
    "pos-tab", "floor-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "reports-tab",
    "editor-tab", "crm-tab", "customers-tab", "tax-tab", "online-tab", "aggregator-tab", "kds-tab", "tokens-tab",
    "employees-tab", "growth-hub-tab", "customers-tab", "analytics-tab",
  ],
  manager: [
    "pos-tab", "floor-tab", "qr-orders-tab", "kds-tab", "bills-tab",
    "inventory-tab", "editor-tab", "customers-tab", "reports-tab",
    "analytics-tab", "employees-tab", "growth-hub-tab",
  ],
  cashier: ["pos-tab", "floor-tab", "bills-tab", "customers-tab"],
  waiter:  ["pos-tab", "floor-tab", "kds-tab"],
  captain: ["pos-tab", "floor-tab", "kds-tab", "qr-orders-tab"],
  kitchen: ["kds-tab"],
  inventory: ["inventory-tab", "editor-tab", "reports-tab"],
  customer_display: ["tokens-tab"],
};

const PLAN_ENTITLEMENTS: Record<string, { name: string; maxStaff: number; allowedTabs: string[] }> = {
  starter: {
    name: "Starter",
    maxStaff: 5,
    allowedTabs: ["pos-tab", "floor-tab", "qr-orders-tab", "bills-tab", "inventory-tab", "editor-tab", "kds-tab", "tokens-tab", "employees-tab", "growth-hub-tab", "customers-tab"],
  },
  growth: {
    name: "Growth",
    maxStaff: 15,
    allowedTabs: ROLE_DEFAULT_TABS.admin,
  },
  enterprise: {
    name: "Enterprise",
    maxStaff: 75,
    allowedTabs: ROLE_DEFAULT_TABS.admin,
  },
};

function planFor(code: unknown) {
  return PLAN_ENTITLEMENTS[String(code || "starter")] || PLAN_ENTITLEMENTS.starter;
}

function activeSubscription(status: unknown) {
  return ["active", "trialing"].includes(String(status || "active"));
}

function jsonResponse(body: Record<string, unknown>, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...(req ? getCorsHeaders(req) : { "Access-Control-Allow-Origin": ALLOWED_ORIGIN }), "Content-Type": "application/json; charset=utf-8" },
  });
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split("").map((char) => char.charCodeAt(0)));
}

async function signValue(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
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

function normalizeUsername(value: unknown) {
  return String(value || "").trim();
}

function normalizedTabs(role: string, requested: unknown, tenantTabs: unknown) {
  const roleTabs = ROLE_DEFAULT_TABS[role] || [];
  const enabledTenantTabs = Array.isArray(tenantTabs) ? tenantTabs.map(String) : [];
  const requestedTabs = Array.isArray(requested) ? requested.map(String) : roleTabs;
  return requestedTabs.filter((tab) => roleTabs.includes(tab) && enabledTenantTabs.includes(tab));
}

async function verifyAdminSession(req: Request) {
  if (!SESSION_SECRET) return { ok: false, error: "Session signing secret is not configured." };
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return { ok: false, error: "Invalid session token." };
  }
  const expectedSignature = await signValue(payloadEncoded);
  if (!timingSafeEqualString(expectedSignature, signature)) {
    return { ok: false, error: "Invalid session token." };
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadEncoded)));
    if (!payload.exp || Date.now() > Number(payload.exp)) {
      return { ok: false, error: "Session expired. Please log in again." };
    }
    if (payload.role !== "admin") return { ok: false, error: "Administrator access is required." };

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("saas_tenants")
      .select("id, status, allowed_tabs, plan_code, subscription_status")
      .eq("id", String(payload.tenant_id || ""))
      .maybeSingle();
    if (tenantError || !tenant || tenant.status !== "approved" || !activeSubscription(tenant.subscription_status)) {
      return { ok: false, error: "Workspace access is not active." };
    }
    const plan = planFor(tenant.plan_code);
    const tenantTabs = Array.isArray(tenant.allowed_tabs) ? tenant.allowed_tabs.map(String) : plan.allowedTabs;

    const userId = String(payload.user_id || "");
    if (!userId) {
      if (payload.legacy_owner !== true) return { ok: false, error: "Invalid administrator session." };
      return {
        ok: true,
        tenantId: tenant.id,
        tenantTabs,
        planCode: tenant.plan_code || "starter",
        planName: plan.name,
        maxStaff: plan.maxStaff,
        actorUserId: null,
        actorUsername: String(payload.username || "owner"),
      };
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("tenant_users")
      .select("id, username, role, status, session_version")
      .eq("id", userId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (
      userError || !user || user.status !== "active" || user.role !== "admin"
      || Number(user.session_version) !== Number(payload.session_version)
    ) {
      return { ok: false, error: "Administrator session was revoked." };
    }
    return {
      ok: true,
      tenantId: tenant.id,
      tenantTabs,
      planCode: tenant.plan_code || "starter",
      planName: plan.name,
      maxStaff: plan.maxStaff,
      actorUserId: user.id,
      actorUsername: user.username,
    };
  } catch {
    return { ok: false, error: "Invalid session token." };
  }
}

async function writeAudit(
  admin: Record<string, unknown>,
  action: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await supabaseAdmin.from("tenant_audit_logs").insert({
    tenant_id: admin.tenantId,
    actor_user_id: admin.actorUserId,
    actor_username: admin.actorUsername,
    actor_role: "admin",
    action,
    target_type: "tenant_user",
    target_id: targetId,
    metadata,
  });
  if (error) console.error("tenant-users audit log failed:", error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, req);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Staff account backend is not configured." }, 500, req);
  }

  const admin = await verifyAdminSession(req);
  if (!admin.ok) return jsonResponse({ error: admin.error as string }, 401, req);

  try {
    const payload = await req.json();
    const action = String(payload.action || "");

    if (action === "list_users") {
      const { data, error, count } = await supabaseAdmin
        .from("tenant_users")
        .select("id, employee_id, username, display_name, role, allowed_tabs, status, session_version, last_login_at, created_at", { count: "exact" })
        .eq("tenant_id", admin.tenantId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const activeStaff = (data || []).filter((user) => user.status === "active").length;
      return jsonResponse({
        users: data || [],
        usage: { active_staff: activeStaff, total_staff: count || 0, max_staff: admin.maxStaff },
        plan: { code: admin.planCode, name: admin.planName },
      }, 200, req);
    }

    if (action === "audit_logs") {
      const requestedLimit = Math.min(Math.max(Number(payload.limit) || 50, 1), 100);
      const { data, error } = await supabaseAdmin
        .from("tenant_audit_logs")
        .select("id, actor_username, actor_role, action, target_type, target_id, metadata, created_at")
        .eq("tenant_id", admin.tenantId)
        .order("created_at", { ascending: false })
        .limit(requestedLimit);
      if (error) throw error;
      return jsonResponse({ logs: data || [] }, 200, req);
    }

    if (action === "create_user") {
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || "");
      const displayName = String(payload.display_name || "").trim();
      const role = String(payload.role || "");
      if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
        return jsonResponse({ error: "Username must be 3-50 letters, numbers, dots, underscores, or hyphens." }, 400, req);
      }
      if (!displayName || displayName.length > 100) {
        return jsonResponse({ error: "Display name is required and must be 100 characters or fewer." }, 400, req);
      }
      if (password.length < 10) return jsonResponse({ error: "Password must be at least 10 characters." }, 400, req);
      if (!Object.hasOwn(ROLE_DEFAULT_TABS, role)) return jsonResponse({ error: "Invalid staff role." }, 400, req);

      const { count: activeStaff, error: countError } = await supabaseAdmin
        .from("tenant_users")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", admin.tenantId)
        .eq("status", "active");
      if (countError) throw countError;
      if ((activeStaff || 0) >= Number(admin.maxStaff)) {
        return jsonResponse({ error: `${admin.planName} supports up to ${admin.maxStaff} active staff accounts.` }, 409, req);
      }

      const { data, error } = await supabaseAdmin.from("tenant_users").insert({
        tenant_id: admin.tenantId,
        employee_id: String(payload.employee_id || "").trim() || null,
        username,
        username_normalized: username.toLowerCase(),
        display_name: displayName,
        password_hash: await hashPassword(password),
        role,
        allowed_tabs: normalizedTabs(role, payload.allowed_tabs, admin.tenantTabs),
      }).select("id, employee_id, username, display_name, role, allowed_tabs, status, created_at").single();
      if (error?.code === "23505") return jsonResponse({ error: "That username already exists in this workspace." }, 409, req);
      if (error) throw error;
      await writeAudit(admin, "staff.create", data.id, { role });
      return jsonResponse({ user: data }, 201, req);
    }

    const targetId = String(payload.user_id || "");
    if (!targetId) return jsonResponse({ error: "Staff user ID is required." }, 400, req);
    const { data: current, error: currentError } = await supabaseAdmin
      .from("tenant_users")
      .select("id, role, allowed_tabs, status, session_version")
      .eq("id", targetId)
      .eq("tenant_id", admin.tenantId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonResponse({ error: "Staff account was not found." }, 404, req);

    if (action === "update_user") {
      const role = payload.role === undefined ? current.role : String(payload.role);
      const status = payload.status === undefined ? current.status : String(payload.status);
      if (!Object.hasOwn(ROLE_DEFAULT_TABS, role)) return jsonResponse({ error: "Invalid staff role." }, 400, req);
      if (!["active", "suspended"].includes(status)) return jsonResponse({ error: "Invalid staff status." }, 400, req);
      if (targetId === admin.actorUserId && (role !== "admin" || status !== "active")) {
        return jsonResponse({ error: "You cannot remove your own administrator access." }, 400, req);
      }
      if (current.status !== "active" && status === "active") {
        const { count: activeStaff, error: countError } = await supabaseAdmin
          .from("tenant_users")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", admin.tenantId)
          .eq("status", "active");
        if (countError) throw countError;
        if ((activeStaff || 0) >= Number(admin.maxStaff)) {
          return jsonResponse({ error: `${admin.planName} supports up to ${admin.maxStaff} active staff accounts.` }, 409, req);
        }
      }

      const changes: Record<string, unknown> = {
        role, status,
        allowed_tabs: normalizedTabs(role, payload.allowed_tabs === undefined ? current.allowed_tabs : payload.allowed_tabs, admin.tenantTabs),
        updated_at: new Date().toISOString(),
        session_version: Number(current.session_version) + 1,
      };
      if (payload.display_name !== undefined) {
        const displayName = String(payload.display_name || "").trim();
        if (!displayName || displayName.length > 100) {
          return jsonResponse({ error: "Display name is required and must be 100 characters or fewer." }, 400, req);
        }
        changes.display_name = displayName;
      }
      if (payload.employee_id !== undefined) changes.employee_id = String(payload.employee_id || "").trim() || null;

      const { data, error } = await supabaseAdmin.from("tenant_users")
        .update(changes).eq("id", targetId).eq("tenant_id", admin.tenantId)
        .select("id, employee_id, username, display_name, role, allowed_tabs, status, session_version").single();
      if (error) throw error;
      await writeAudit(admin, "staff.update", targetId, { role, status });
      return jsonResponse({ user: data }, 200, req);
    }

    if (action === "reset_password") {
      const password = String(payload.password || "");
      if (password.length < 10) return jsonResponse({ error: "Password must be at least 10 characters." }, 400, req);
      const { error } = await supabaseAdmin.from("tenant_users").update({
        password_hash: await hashPassword(password),
        session_version: Number(current.session_version) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", targetId).eq("tenant_id", admin.tenantId);
      if (error) throw error;
      await writeAudit(admin, "staff.password_reset", targetId);
      return jsonResponse({ success: true }, 200, req);
    }

    if (action === "revoke_user_sessions") {
      const { error } = await supabaseAdmin.from("tenant_users").update({
        session_version: Number(current.session_version) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", targetId).eq("tenant_id", admin.tenantId);
      if (error) throw error;
      await writeAudit(admin, "staff.sessions_revoked", targetId);
      return jsonResponse({ success: true }, 200, req);
    }

    if (action === "delete_user") {
      if (targetId === admin.actorUserId) {
        return jsonResponse({ error: "You cannot delete your own administrator account." }, 400, req);
      }
      await writeAudit(admin, "staff.delete", targetId, { role: current.role, status: current.status });
      const { error } = await supabaseAdmin
        .from("tenant_users")
        .delete()
        .eq("id", targetId)
        .eq("tenant_id", admin.tenantId);
      if (error) throw error;
      return jsonResponse({ success: true }, 200, req);
    }

    return jsonResponse({ error: "Unsupported action." }, 400, req);
  } catch (error) {
    console.error("tenant-users function error:", error);
    return jsonResponse({ error: "Staff account operation failed." }, 500, req);
  }
});
