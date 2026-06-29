/**
 * Supabase Edge Function: stripe-connect
 *
 * Handles Stripe Connect onboarding and Stripe Checkout payments for non-Indian tenants (e.g. Ireland/EU).
 *
 * Deploy:
 *   supabase functions deploy stripe-connect
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY        — your platform Stripe Secret Key (sk_live_xxx / sk_test_xxx)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";

const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY       = Deno.env.get("STRIPE_SECRET_KEY") || "";

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── CORS Headers ─────────────────────────────────────────────────────────────

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

// ── Auth helper: validate staff JWT ──────────────────────────────────────────

async function getTenantFromAuth(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: staff } = await supabase
    .from("doppio_staff")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!staff?.tenant_id) return null;

  const { data: tenant } = await supabase
    .from("saas_tenants")
    .select("id, slug, name, stripe_account_id, stripe_enabled, stripe_kyc_status")
    .eq("id", staff.tenant_id)
    .maybeSingle();

  return tenant || null;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

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

  // ── Action: create_checkout_session (Public checkout from table QRs) ──────
  if (action === "create_checkout_session") {
    const tenantSlug = String(payload.tenant_slug || "").trim().toLowerCase();
    const orderId    = String(payload.order_id || "").trim();
    const amountRaw  = Number(payload.amount || 0);
    const table      = String(payload.table || "").trim();
    const currency   = String(payload.currency || "EUR").toUpperCase();

    if (!tenantSlug || !orderId || amountRaw <= 0) {
      return json({ error: "Missing required fields: tenant_slug, order_id, amount" }, 400, req);
    }

    // Fetch tenant Connect info
    const { data: tenant } = await supabase
      .from("saas_tenants")
      .select("id, name, stripe_account_id, stripe_enabled")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (!tenant) return json({ error: "Outlet not found" }, 404, req);
    if (!tenant.stripe_enabled || !tenant.stripe_account_id) {
      return json({ error: "Card payments not enabled for this outlet" }, 400, req);
    }

    try {
      const centAmount = Math.round(amountRaw * 100);

      // Create Stripe Checkout Session (Direct Destination Charge model)
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `Table ${table} Dine-in Order`,
                description: `Order ID: ${orderId} at ${tenant.name}`,
              },
              unit_amount: centAmount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        payment_intent_data: {
          transfer_data: {
            destination: tenant.stripe_account_id,
          },
          metadata: {
            order_id: orderId,
            tenant_slug: tenantSlug,
            table,
          },
        },
        success_url: `https://restrosuite.codearc.co.in/qr-order.html?tenant=${tenantSlug}&table=${table}&session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `https://restrosuite.codearc.co.in/qr-order.html?tenant=${tenantSlug}&table=${table}&success=false`,
      });

      return json({
        success: true,
        checkout_url: session.url,
      }, 200, req);
    } catch (e) {
      console.error("Stripe Checkout creation failed:", e);
      return json({ error: `Stripe error: ${e.message}` }, 500, req);
    }
  }

  // ── All actions below require staff authentication ─────────────────────────

  const tenant = await getTenantFromAuth(req);
  if (!tenant) return json({ error: "Unauthorized" }, 401, req);

  // ── Action: get_account ────────────────────────────────────────────────────
  if (action === "get_account") {
    let stripeDetails = null;

    if (tenant.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(tenant.stripe_account_id);
        stripeDetails = {
          id: account.id,
          charges_enabled: account.charges_enabled,
          details_submitted: account.details_submitted,
          payouts_enabled: account.payouts_enabled,
        };

        // Sync with database if they completed onboarding
        if (account.charges_enabled && tenant.stripe_kyc_status !== "active") {
          await supabase
            .from("saas_tenants")
            .update({
              stripe_kyc_status: "active",
              stripe_enabled: true,
            })
            .eq("id", tenant.id);
        }
      } catch (e) {
        console.warn("Failed to fetch Stripe account details:", e);
      }
    }

    return json({
      stripe_account_id: tenant.stripe_account_id,
      stripe_enabled: tenant.stripe_account_id ? (stripeDetails?.charges_enabled || tenant.stripe_enabled) : false,
      stripe_kyc_status: tenant.stripe_account_id ? (stripeDetails?.charges_enabled ? "active" : tenant.stripe_kyc_status) : "not_started",
      account_details: stripeDetails,
    }, 200, req);
  }

  // ── Action: onboard_account ────────────────────────────────────────────────
  if (action === "onboard_account") {
    try {
      let accountId = tenant.stripe_account_id;

      if (!accountId) {
        // Step 1: Create Stripe Express account
        const account = await stripe.accounts.create({
          type: "express",
          country: String(payload.country || "IE"),
          business_type: "individual",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: {
            tenant_id: tenant.id,
            tenant_slug: tenant.slug,
          },
        });

        accountId = account.id;

        // Save account ID to DB
        await supabase
          .from("saas_tenants")
          .update({
            stripe_account_id: accountId,
            stripe_kyc_status: "pending",
            stripe_enabled: false,
          })
          .eq("id", tenant.id);
      }

      // Step 2: Generate Hosted Onboarding Link
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: "https://restrosuite.codearc.co.in/dashboard?tab=settings&stripe_return=refresh",
        return_url: "https://restrosuite.codearc.co.in/dashboard?tab=settings&stripe_return=success",
        type: "account_onboarding",
      });

      return json({
        success: true,
        account_id: accountId,
        onboarding_url: accountLink.url,
      }, 200, req);
    } catch (e) {
      console.error("Stripe Onboarding failed:", e);
      return json({ error: `Stripe error: ${e.message}` }, 500, req);
    }
  }

  return json({ error: "Unknown action" }, 400, req);
});
