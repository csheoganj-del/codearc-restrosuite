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
