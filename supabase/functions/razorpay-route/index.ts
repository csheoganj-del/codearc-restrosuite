/**
 * Supabase Edge Function: razorpay-route
 *
 * Handles Razorpay Route marketplace payments — customer pays the restaurant
 * directly via Razorpay; RestroSuite never holds the funds.
 *
 * Deploy:
 *   supabase functions deploy razorpay-route
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RAZORPAY_KEY_ID          — your platform Razorpay key (rzp_live_xxx)
 *   RAZORPAY_KEY_SECRET      — your platform Razorpay secret
 *
 * Actions:
 *   onboard_account  — create a Razorpay linked account for a restaurant
 *   create_order     — create a Razorpay order for customer checkout
 *   get_account      — fetch this tenant's Route status
 *
 * Flow:
 *   1. Restaurant admin calls onboard_account once → Razorpay creates acc_xxx
 *   2. Customer scans QR, hits Pay Bill → frontend calls create_order
 *   3. Frontend opens Razorpay Checkout with the returned order_id
 *   4. Customer pays → Razorpay fires payment.captured webhook (razorpay-webhook)
 *   5. Webhook marks order Paid + Razorpay Route transfers to restaurant's bank (T+2)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RZP_KEY_ID              = Deno.env.get("RAZORPAY_KEY_ID")!;
const RZP_KEY_SECRET          = Deno.env.get("RAZORPAY_KEY_SECRET")!;
// Same secret used to sign the app's custom HMAC session tokens (tenant-access).
const SUPERADMIN_SESSION_SECRET = Deno.env.get("SUPERADMIN_SESSION_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function basicAuth(): string {
  return "Basic " + btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
}

async function rzpPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.razorpay.com${path}`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Razorpay error: ${json?.error?.description || res.statusText}`);
  return json as Record<string, unknown>;
}

async function rzpGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.razorpay.com${path}`, {
    headers: { Authorization: basicAuth() },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Razorpay error: ${json?.error?.description || res.statusText}`);
  return json as Record<string, unknown>;
}

function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": req.headers.get("origin") || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
// ── App session (custom HMAC token) verification — mirrors tenant-access ─────
function decodeB64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split("").map((c) => c.charCodeAt(0)));
}
function encB64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function hmacB64Url(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encB64Url(new Uint8Array(sig));
}
async function verifyAppSession(req: Request): Promise<{ tenant_id: string } | null> {
  if (!SUPERADMIN_SESSION_SECRET) return null;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return null;
  const expected = await hmacB64Url(payloadEncoded, SUPERADMIN_SESSION_SECRET);
  if (expected !== signature) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(decodeB64Url(payloadEncoded)));
    if (!p.exp || Date.now() > Number(p.exp)) return null;
    const tid = String(p.tenant_id || "");
    if (!tid || tid === "superadmin") return null;
    return { tenant_id: tid };
  } catch { return null; }
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? corsHeaders(req) : {}),
      "Content-Type": "application/json",
    },
  });
}

// ── Auth: validate staff JWT and return tenant row ────────────────────────────

async function getTenantFromAuth(req: Request): Promise<{ id: string; slug: string; name: string; razorpay_account_id: string | null; razorpay_route_enabled: boolean; razorpay_kyc_status: string } | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  // Verify the JWT is a valid staff session
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Map user to tenant via doppio_staff
  const { data: staff } = await supabase
    .from("doppio_staff")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!staff?.tenant_id) return null;

  const { data: tenant } = await supabase
    .from("saas_tenants")
    .select("id, slug, name, razorpay_account_id, razorpay_route_enabled, razorpay_kyc_status")
    .eq("id", staff.tenant_id)
    .maybeSingle();

  return tenant || null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const action = String(payload.action || "");

  // ── create_order: called by QR portal (public, no auth needed) ────────────
  // The QR portal is customer-facing, so no staff JWT — we look up by tenant_slug.
  if (action === "create_order") {
    const tenantSlug = String(payload.tenant_slug || "").trim().toLowerCase();
    const orderId    = String(payload.order_id || "").trim();
    const amountRaw  = Number(payload.amount || 0);
    const table      = String(payload.table || "").trim();

    if (!tenantSlug || !orderId || amountRaw <= 0) {
      return json({ error: "Missing required fields: tenant_slug, order_id, amount" }, 400, req);
    }
    if (!/^DO-QR-[A-Z0-9-]{8,64}$/i.test(orderId)) {
      return json({ error: "Invalid order_id format" }, 400, req);
    }
    if (amountRaw > 1_000_000) {
      return json({ error: "Amount too large" }, 400, req);
    }

    // Fetch tenant + Route config
    const { data: tenant } = await supabase
      .from("saas_tenants")
      .select("id, name, razorpay_account_id, razorpay_route_enabled, razorpay_kyc_status")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (!tenant) return json({ error: "Outlet not found" }, 404, req);
    if (!tenant.razorpay_route_enabled || !tenant.razorpay_account_id) {
      return json({ error: "Online payment not enabled for this outlet" }, 400, req);
    }

    // Razorpay amount is in paise (₹1 = 100 paise)
    const amountPaise = Math.round(amountRaw * 100);

    // Create Razorpay order with Route transfer config
    const rzpOrder = await rzpPost("/v1/orders", {
      amount: amountPaise,
      currency: "INR",
      receipt: orderId,
      notes: {
        order_id:    orderId,
        tenant_slug: tenantSlug,
        table,
      },
      // Route: transfer to restaurant's linked account on payment capture
      transfers: [
        {
          account:  tenant.razorpay_account_id,
          amount:   amountPaise,           // full amount goes to restaurant
          currency: "INR",
          notes: {
            purpose: `Table ${table} Order`,
          },
          // Optional: set on_hold: true if you want to hold and release manually
          on_hold: 0,
        },
      ],
    });

    return json({
      success:        true,
      rzp_order_id:  rzpOrder.id,
      rzp_key:       RZP_KEY_ID,
      amount:        amountPaise,
      currency:      "INR",
      name:          tenant.name,
    }, 200, req);
  }

  // ── get_plans: tenant-facing plan catalogue + current subscription ────────
  if (action === "get_plans") {
    const session = await verifyAppSession(req);
    if (!session) return json({ error: "Unauthorized" }, 401, req);
    const [{ data: plans }, { data: tenantRow }] = await Promise.all([
      supabase.from("saas_plans")
        .select("plan_code, name, price_monthly, currency, billing_interval, is_public, razorpay_plan_id, max_staff, monthly_order_limit, support_level")
        .order("price_monthly", { ascending: true }),
      supabase.from("saas_tenants")
        .select("plan_code, subscription_status, subscription_current_period_end")
        .eq("id", session.tenant_id).maybeSingle(),
    ]);
    const publicPlans = (plans || []).filter((p: any) => p.is_public !== false).map((p: any) => ({
      plan_code: p.plan_code, name: p.name, price_monthly: Number(p.price_monthly) || 0,
      currency: p.currency || "INR", billing_interval: p.billing_interval || "monthly",
      max_staff: p.max_staff, monthly_order_limit: p.monthly_order_limit, support_level: p.support_level,
      checkout_available: !!p.razorpay_plan_id,
    }));
    return json({
      plans: publicPlans,
      current: {
        plan_code: tenantRow?.plan_code || "starter",
        subscription_status: tenantRow?.subscription_status || "active",
        subscription_current_period_end: tenantRow?.subscription_current_period_end || null,
      },
    }, 200, req);
  }

  // ── create_subscription: tenant self-serve plan upgrade ───────────────────
  if (action === "create_subscription") {
    const session = await verifyAppSession(req);
    if (!session) return json({ error: "Unauthorized" }, 401, req);
    const planCode = String(payload.plan_code || "").trim().toLowerCase();
    if (!["starter", "growth", "enterprise"].includes(planCode)) {
      return json({ error: "Invalid plan." }, 400, req);
    }
    const { data: plan } = await supabase
      .from("saas_plans")
      .select("plan_code, name, price_monthly, currency, razorpay_plan_id, is_public")
      .eq("plan_code", planCode).maybeSingle();
    if (!plan || plan.is_public === false) {
      return json({ error: "This plan is not available for self-serve checkout." }, 400, req);
    }
    if (!plan.razorpay_plan_id) {
      return json({ error: "Online checkout for this plan isn't configured yet. Please contact RestroSuite support to upgrade.", code: "no_razorpay_plan" }, 400, req);
    }
    const { data: tenantRow } = await supabase
      .from("saas_tenants")
      .select("id, name, slug, username, email, phone, subscription_id")
      .eq("id", session.tenant_id).maybeSingle();
    if (!tenantRow) return json({ error: "Workspace not found." }, 404, req);
    try {
      const sub = await rzpPost("/v1/subscriptions", {
        plan_id: plan.razorpay_plan_id, total_count: 120, quantity: 1, customer_notify: 1,
        notes: { tenant_username: tenantRow.username, tenant_id: tenantRow.id, tenant_slug: tenantRow.slug, plan_code: planCode },
      });
      return json({
        success: true, subscription_id: sub.id, short_url: sub.short_url, rzp_key: RZP_KEY_ID,
        plan: { code: plan.plan_code, name: plan.name, price_monthly: plan.price_monthly, currency: plan.currency },
      }, 200, req);
    } catch (e) {
      console.error("create_subscription failed:", e);
      return json({ error: "Could not start checkout. Please try again." }, 502, req);
    }
  }

  // ── All actions below require staff auth ──────────────────────────────────

  const tenant = await getTenantFromAuth(req);
  if (!tenant) return json({ error: "Unauthorized" }, 401, req);

  // ── get_account: return current Route status ──────────────────────────────
  if (action === "get_account") {
    let kycDetails = null;

    if (tenant.razorpay_account_id) {
      try {
        kycDetails = await rzpGet(`/v2/accounts/${tenant.razorpay_account_id}`);
      } catch (e) {
        console.warn("Failed to fetch Razorpay account details:", e);
      }
    }

    return json({
      razorpay_account_id:   tenant.razorpay_account_id,
      razorpay_route_enabled: tenant.razorpay_route_enabled,
      razorpay_kyc_status:   tenant.razorpay_kyc_status,
      account_details:       kycDetails,
    }, 200, req);
  }

  // ── onboard_account: create Razorpay linked account for this restaurant ───
  if (action === "onboard_account") {
    if (tenant.razorpay_account_id) {
      return json({ error: "Razorpay account already exists for this outlet", account_id: tenant.razorpay_account_id }, 409, req);
    }

    const {
      legal_business_name,
      business_type,         // restaurant | individual | partnership | private_limited | public_limited | llp
      contact_name,
      contact_email,
      contact_mobile,
      pan,
      bank_account_number,
      bank_ifsc,
      bank_beneficiary_name,
    } = payload as Record<string, string>;

    if (!legal_business_name || !contact_name || !contact_email || !contact_mobile || !pan || !bank_account_number || !bank_ifsc || !bank_beneficiary_name) {
      return json({ error: "Missing required onboarding fields" }, 400, req);
    }

    // Step 1: Create linked account
    const account = await rzpPost("/v2/accounts", {
      email:       contact_email,
      profile: {
        category:    "food_and_beverage",
        subcategory: "restaurant",
        addresses: {
          registered: {
            street1: String(payload.address_street || "").slice(0, 100),
            city:    String(payload.address_city   || "").slice(0, 60),
            state:   String(payload.address_state  || "Maharashtra"),
            postal_code: String(payload.address_pin || "400001"),
            country: "IN",
          },
        },
      },
      type:        "route",
      legal_info: {
        pan,
      },
      legal_business_name,
      business_type: business_type || "restaurant",
      contact_name,
      contact_info: {
        policy_details: {
          email: contact_email,
          phone: contact_mobile,
        },
      },
    });

    const accountId = account.id as string;

    // Step 2: Add stakeholder (required for KYC)
    await rzpPost(`/v2/accounts/${accountId}/stakeholders`, {
      name:  contact_name,
      email: contact_email,
      phone: { primary: contact_mobile },
      relationship: { director: true },
    });

    // Step 3: Add bank account for settlement
    await rzpPost(`/v2/accounts/${accountId}/bank_account`, {
      ifsc_code:        bank_ifsc,
      beneficiary_name: bank_beneficiary_name,
      account_number:   bank_account_number,
      account_type:     "route",
    });

    // Save account ID to DB — KYC activation comes via webhook (account.activated event)
    await supabase
      .from("saas_tenants")
      .update({
        razorpay_account_id:  accountId,
        razorpay_kyc_status:  "pending",
        razorpay_route_enabled: false,   // enabled only after KYC activated
      })
      .eq("id", tenant.id);

    return json({
      success:    true,
      account_id: accountId,
      message:    "Razorpay linked account created. KYC verification is pending — RestroSuite will activate Route payments automatically once Razorpay approves.",
    }, 200, req);
  }

  return json({ error: "Unknown action" }, 400, req);
});
