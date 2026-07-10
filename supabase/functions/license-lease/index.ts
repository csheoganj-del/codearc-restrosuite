import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ============================================================================
   RestroSuite — license-lease Edge Function
   ----------------------------------------------------------------------------
   Issues a short-lived, cryptographically signed "lease" that lets a device
   keep running OFFLINE for a bounded window (OFFLINE_WINDOW_DAYS). The device
   cannot forge or extend a lease — only this function, holding the private
   key, can mint one. When the tenant's subscription lapses the server simply
   refuses to issue a new lease, so every device converges to locked within one
   offline window of expiry, even with no connectivity at lockout time.

   Auth reuses the existing tenant session token (same HMAC scheme as
   tenant-access / tenant-data), so no new client credential is needed.

   Signature: ECDSA P-256 / SHA-256. Private key in env LICENSE_SIGNING_KEY
   (base64 PKCS8). Public half is embedded in the clients.
   ========================================================================== */

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://codearc-restrosuite.vercel.app";
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || ALLOWED_ORIGIN)
    .split(",")
    .map((v) => v.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
ALLOWED_ORIGINS.add(ALLOWED_ORIGIN.replace(/\/+$/, ""));
// The Android WebView + custom domain also hit this endpoint.
ALLOWED_ORIGINS.add("https://restrosuite.codearc.co.in");

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
const LICENSE_SIGNING_KEY = Deno.env.get("LICENSE_SIGNING_KEY") || "";

// How long a freshly issued lease is valid for offline. Product decision: 3 days.
const OFFLINE_WINDOW_DAYS = Number(Deno.env.get("LICENSE_OFFLINE_WINDOW_DAYS") || "3");
const LEASE_TTL_MS = OFFLINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
// Small grace added after the paid-until date so a device that is briefly past
// the date still has a moment to reconnect and renew before it locks.
const OFFLINE_GRACE_DAYS = Number(Deno.env.get("LICENSE_OFFLINE_GRACE_DAYS") || "1");
const OFFLINE_GRACE_MS = OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ---------- base64url helpers ---------- */
function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split("").map((c) => c.charCodeAt(0)));
}
function decodeBase64(value: string) {
  const binary = atob(value);
  return new Uint8Array(binary.split("").map((c) => c.charCodeAt(0)));
}

/* ---------- session token verification (mirrors tenant-access) ---------- */
async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(sig));
}
function timingSafeEqualString(a: string, b: string): boolean {
  const aB = new TextEncoder().encode(a);
  const bB = new TextEncoder().encode(b);
  if (aB.length !== bB.length) return false;
  let diff = 0;
  for (let i = 0; i < aB.length; i++) diff |= aB[i] ^ bB[i];
  return diff === 0;
}
async function verifySessionToken(token: string): Promise<{ ok: boolean; payload?: any; error?: string }> {
  if (!SUPERADMIN_SESSION_SECRET) return { ok: false, error: "Session signing secret not configured." };
  const [payloadEncoded, signature] = String(token || "").split(".");
  if (!payloadEncoded || !signature) return { ok: false, error: "Invalid session token." };
  const expected = await hmac(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (!timingSafeEqualString(expected, signature)) return { ok: false, error: "Invalid session token." };
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadEncoded)));
    if (!payload.exp || Date.now() > Number(payload.exp)) return { ok: false, error: "Session expired." };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid session token." };
  }
}

/* ---------- lease signing (ECDSA P-256 / SHA-256) ---------- */
let signingKeyPromise: Promise<CryptoKey> | null = null;
function getSigningKey(): Promise<CryptoKey> {
  if (!signingKeyPromise) {
    signingKeyPromise = crypto.subtle.importKey(
      "pkcs8",
      decodeBase64(LICENSE_SIGNING_KEY),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  return signingKeyPromise;
}
async function signLease(claims: Record<string, unknown>): Promise<string> {
  const payloadEncoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await getSigningKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(payloadEncoded),
  );
  return `${payloadEncoded}.${encodeBase64Url(new Uint8Array(sig))}`;
}

function activeSubscription(status: unknown) {
  return ["active", "trialing"].includes(String(status ?? "active"));
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, req);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Backend not configured." }, 500, req);
  }
  if (!LICENSE_SIGNING_KEY) {
    console.error("license-lease: LICENSE_SIGNING_KEY is not set.");
    return jsonResponse({ error: "License service not configured." }, 500, req);
  }

  // Auth: prefer the Authorization: Bearer <session token>, fall back to body.
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { /* body optional */ }

  const sessionToken = bearer || String(payload.session_token || "");
  const deviceId = String(payload.device_id || "unknown").slice(0, 128);

  const session = await verifySessionToken(sessionToken);
  if (!session.ok) {
    // 401 => client should bounce to login. Not a subscription problem.
    return jsonResponse({ error: session.error || "Unauthorized.", status: "unauthenticated" }, 401, req);
  }

  const tenantId = String(session.payload?.tenant_id || "");
  // Superadmin/impersonation tokens carry a sentinel tenant_id — never gate them.
  if (!tenantId || tenantId === "superadmin") {
    return jsonResponse({ error: "Lease not applicable to this account.", status: "not_applicable" }, 400, req);
  }

  const { data: tenant, error } = await supabaseAdmin
    .from("saas_tenants")
    .select("id, name, status, plan_code, subscription_status, subscription_current_period_end")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("license-lease tenant lookup failed:", error);
    return jsonResponse({ error: "Failed to verify subscription." }, 500, req);
  }
  if (!tenant) {
    return jsonResponse({ error: "Workspace not found.", status: "expired" }, 404, req);
  }

  // The real gate: no active subscription => refuse to mint a lease. Existing
  // leases on the device will run out on their own within one offline window.
  const planExpiresAt = tenant.subscription_current_period_end || null;
  const planLapsed =
    !activeSubscription(tenant.subscription_status) ||
    tenant.status !== "approved" ||
    (planExpiresAt && Date.now() > new Date(planExpiresAt).getTime());

  if (planLapsed) {
    return jsonResponse({
      status: "expired",
      subscription_status: tenant.subscription_status,
      error: "Subscription is not active. Renew to continue using RestroSuite.",
    }, 402, req);
  }

  // Per-device kill switch: a device flagged 'revoked' is refused a new lease
  // and locks itself once its current lease runs out (<= one offline window).
  const { data: device } = await supabaseAdmin
    .from("saas_license_devices")
    .select("device_id, revoked")
    .eq("tenant_id", tenant.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (device?.revoked) {
    return jsonResponse({
      status: "revoked",
      error: "This device has been deactivated. Contact RestroSuite support.",
    }, 403, req);
  }

  const now = Date.now();
  // Offline-until-paid-date model: the device may run offline right up to the
  // date the tenant has paid for (subscription_current_period_end) + a small
  // grace. So a tenant who paid for a month can be fully offline for that whole
  // month; a yearly tenant for the whole year. Only when the paid period ends
  // (and they haven't renewed) does the device lock itself offline.
  // Fallback: if no paid-until date is set, use the bounded rolling window so
  // the device still needs to reconnect periodically.
  const periodEndMs = planExpiresAt ? new Date(planExpiresAt).getTime() : 0;
  const leaseExpiresAt = (periodEndMs && periodEndMs > now)
    ? periodEndMs + OFFLINE_GRACE_MS
    : now + LEASE_TTL_MS;
  const claims = {
    v: 1,
    tenant_id: tenant.id,
    device_id: deviceId,
    plan: tenant.plan_code || "starter",
    subscription_status: tenant.subscription_status || "active",
    plan_expires_at: periodEndMs || null,
    issued_at: now,
    lease_expires_at: leaseExpiresAt,
    server_time: now,
  };

  const lease = await signLease(claims);

  // Record the lease issuance (audit + registers the device for kill-switch).
  // Best-effort: never fail a valid lease because the audit write hiccuped.
  try {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
      || req.headers.get("cf-connecting-ip") || "";
    let ipHash: string | null = null;
    if (ip) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
      ipHash = encodeBase64Url(new Uint8Array(buf)).slice(0, 32);
    }
    await supabaseAdmin.rpc("saas_register_lease", {
      p_tenant_id: tenant.id,
      p_device_id: deviceId,
      p_plan: claims.plan,
      p_ip_hash: ipHash,
    });
  } catch (e) {
    console.warn("license-lease device audit write failed:", e);
  }

  return jsonResponse({
    status: "active",
    lease,
    claims,               // convenience copy; the signed token is authoritative
    server_time: now,     // clients anchor their monotonic clock to this
    offline_window_days: OFFLINE_WINDOW_DAYS,
  }, 200, req);
});
