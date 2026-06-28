/**
 * Supabase Edge Function: razorpay-webhook
 *
 * Handles Razorpay subscription lifecycle events and keeps the
 * saas_tenants table in sync with the billing state.
 *
 * Deploy:
 *   supabase functions deploy razorpay-webhook
 *
 * Required secrets (set via `supabase secrets set KEY=value`):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RAZORPAY_WEBHOOK_SECRET
 *
 * Razorpay dashboard webhook URL:
 *   https://<project-ref>.supabase.co/functions/v1/razorpay-webhook
 *
 * Events to enable in Razorpay:
 *   subscription.activated
 *   subscription.charged
 *   subscription.cancelled
 *   subscription.completed
 *   payment.failed
 *   payment.captured        ← Route: marks QR order as Paid, triggers transfer
 *   account.activated       ← Route: enables Route payments for the restaurant
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

// ── Plan ID → slug mapping ────────────────────────────────────────────────────
// Plan slugs MUST match the PLAN_ENTITLEMENTS keys in tenant-access/index.ts:
//   free | starter | growth | enterprise
// Update the Razorpay plan IDs below after creating plans in your dashboard.
// Pricing (source of truth — keep in sync with index.html and README):
//   starter    ₹749 / month
//   growth     ₹1,499 / month
//   enterprise ₹2,999 / month
const PLAN_SLUG_MAP: Record<string, string> = {
  plan_starter_monthly: "starter",      // ₹749 / month
  plan_growth_monthly: "growth",        // ₹1,499 / month
  plan_enterprise_monthly: "enterprise", // ₹2,999 / month
  // Legacy plan IDs (kept for backward compatibility with existing subscriptions)
  plan_basic_monthly: "starter",
  plan_standard_monthly: "growth",
  plan_pro_monthly: "growth",
};

// ── Verify Razorpay webhook signature ────────────────────────────────────────
async function verifySignature(
  rawBody: string,
  signatureHeader: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const computed = encodeHex(new Uint8Array(signature));
  return timingSafeEqual(computed, signatureHeader);
}

// Constant-time string comparison — prevents timing side-channel attacks on
// signature verification (a simple === short-circuits on first mismatch).
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-razorpay-signature") ?? "";

  const valid = await verifySignature(rawBody, signatureHeader);
  if (!valid) {
    console.error("Webhook signature verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = payload.event as string;
  const eventId = (payload.id as string) ?? "";

  // ── Idempotency guard ─────────────────────────────────────────────────────
  // Razorpay retries delivery on any non-2xx response. Without this guard, a
  // transient DB error on subscription.cancelled would re-apply side-effects on
  // retry and could suspend an already-cancelled tenant twice, or—worse—leave a
  // tenant in the wrong state if a previously-applied event fires again.
  if (eventId) {
    const supabaseCheck = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: idempotencyError } = await supabaseCheck
      .from("processed_webhook_events")
      .insert({ event_id: eventId, processed_at: new Date().toISOString() });

    if (idempotencyError) {
      if (idempotencyError.code === "23505") {
        // Duplicate key — event already processed. Acknowledge so Razorpay stops retrying.
        console.log(`Duplicate event ${eventId} — already processed, acknowledging.`);
        return new Response("OK — already processed", { status: 200 });
      }
      // Unexpected DB error: return 500 so Razorpay retries later.
      console.error("Idempotency insert failed:", idempotencyError);
      return new Response("DB error", { status: 500 });
    }
  }

  const entity = (payload.payload as Record<string, unknown>)?.subscription
    ?.entity as Record<string, unknown> | undefined;

  if (!entity) {
    // payment.failed may not carry a subscription entity — log and acknowledge
    console.warn(`No subscription entity in event: ${event}`, payload);
    return new Response("OK", { status: 200 });
  }

  const subscriptionId = entity.id as string;
  const planId = (entity.plan_id as string) ?? "";
  const planSlug = PLAN_SLUG_MAP[planId] ?? "starter";

  // The tenant's username is stored in the subscription notes at creation time.
  // Set notes: { tenant_username: "their-username" } when creating the Razorpay subscription.
  const notes = (entity.notes as Record<string, string>) ?? {};
  const tenantUsername = notes.tenant_username;

  if (!tenantUsername) {
    console.error("No tenant_username in subscription notes", entity);
    // Still acknowledge so Razorpay doesn't retry indefinitely
    return new Response("OK — no tenant_username", { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  switch (event) {
    // ── Subscription activated (first payment succeeded) ──────────────────
    case "subscription.activated": {
      const { error } = await supabase
        .from("saas_tenants")
        .update({
          status: "active",
          // plan_code is the column read by tenant-access/tenant-data/tenant-admin.
          // Writing `plan` (the old field) silently left the entitlement gate stale.
          plan_code: planSlug,
          subscription_id: subscriptionId,
          subscription_activated_at: new Date().toISOString(),
          subscription_status: "active",
        })
        .eq("username", tenantUsername);

      if (error) {
        console.error("DB update failed (activated):", error);
        return new Response("DB error", { status: 500 });
      }
      console.log(`Tenant ${tenantUsername} activated on plan ${planSlug}`);
      break;
    }

    // ── Recurring charge succeeded ─────────────────────────────────────────
    case "subscription.charged": {
      const { error } = await supabase
        .from("saas_tenants")
        .update({
          status: "active",
          subscription_renewed_at: new Date().toISOString(),
        })
        .eq("username", tenantUsername);

      if (error) {
        console.error("DB update failed (charged):", error);
        return new Response("DB error", { status: 500 });
      }
      console.log(`Tenant ${tenantUsername} subscription renewed`);
      break;
    }

    // ── Subscription cancelled by merchant or customer ─────────────────────
    case "subscription.cancelled":
    case "subscription.completed": {
      const { error } = await supabase
        .from("saas_tenants")
        .update({
          status: "suspended",
          subscription_cancelled_at: new Date().toISOString(),
        })
        .eq("username", tenantUsername);

      if (error) {
        console.error("DB update failed (cancelled):", error);
        return new Response("DB error", { status: 500 });
      }
      console.log(`Tenant ${tenantUsername} subscription cancelled/completed`);
      break;
    }

    // ── Payment failed ─────────────────────────────────────────────────────
    case "payment.failed": {
      // Only suspend if this payment was for a subscription
      const paymentEntity = (
        payload.payload as Record<string, unknown>
      )?.payment?.entity as Record<string, unknown> | undefined;

      const paymentNotes =
        (paymentEntity?.notes as Record<string, string>) ?? {};
      const failedTenantUsername =
        paymentNotes.tenant_username ?? tenantUsername;

      const { error } = await supabase
        .from("saas_tenants")
        .update({ status: "payment_failed" })
        .eq("username", failedTenantUsername);

      if (error) {
        console.error("DB update failed (payment.failed):", error);
        return new Response("DB error", { status: 500 });
      }
      console.log(`Payment failed for tenant ${failedTenantUsername}`);
      break;
    }

    // ── Route: payment captured — mark QR order as Paid ──────────────────────
    case "payment.captured": {
      const paymentEntity = (
        payload.payload as Record<string, unknown>
      )?.payment?.entity as Record<string, unknown> | undefined;

      if (!paymentEntity) {
        console.warn("payment.captured: no payment entity");
        break;
      }

      const notes = (paymentEntity.notes as Record<string, string>) ?? {};
      const orderId    = notes.order_id    || String(paymentEntity.receipt || "");
      const tenantSlug = notes.tenant_slug || "";

      if (!orderId || !tenantSlug) {
        console.warn("payment.captured: missing order_id or tenant_slug in notes", notes);
        break;
      }

      // Fetch tenant
      const { data: routeTenant } = await supabase
        .from("saas_tenants")
        .select("id")
        .eq("slug", tenantSlug)
        .maybeSingle();

      if (!routeTenant) {
        console.error("payment.captured: tenant not found for slug", tenantSlug);
        break;
      }

      // Mark the pending order as Paid
      const { error: updateErr } = await supabase
        .from("doppio_pending_orders")
        .update({
          status:        "Paid",
          paymentMethod: "Razorpay",
        })
        .eq("tenant_id", routeTenant.id)
        .eq("orderId", orderId);

      if (updateErr) {
        console.error("payment.captured: failed to update order status", updateErr);
        return new Response("DB error", { status: 500 });
      }

      console.log(`Order ${orderId} marked Paid via Razorpay Route for tenant ${tenantSlug}`);
      break;
    }

    // ── Route: linked account KYC activated — enable Route payments ───────────
    case "account.activated": {
      const accountEntity = (
        payload.payload as Record<string, unknown>
      )?.account?.entity as Record<string, unknown> | undefined;

      const accountId = (accountEntity?.id as string) || "";
      if (!accountId) {
        console.warn("account.activated: no account id in payload");
        break;
      }

      const { error: activateErr } = await supabase
        .from("saas_tenants")
        .update({
          razorpay_route_enabled: true,
          razorpay_kyc_status:    "activated",
        })
        .eq("razorpay_account_id", accountId);

      if (activateErr) {
        console.error("account.activated: DB update failed", activateErr);
        return new Response("DB error", { status: 500 });
      }

      console.log(`Razorpay Route activated for account ${accountId}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event}`);
  }

  return new Response("OK", { status: 200 });
});