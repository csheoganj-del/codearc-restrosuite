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
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.224.0/encoding/hex.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

// ── Plan ID → slug mapping ────────────────────────────────────────────────────
// Update these with your real Razorpay plan IDs after creating them in the dashboard.
const PLAN_SLUG_MAP: Record<string, string> = {
  plan_basic_monthly: "basic",        // ₹999 / month
  plan_standard_monthly: "standard",  // ₹2,499 / month
  plan_enterprise_monthly: "enterprise", // ₹4,999 / month
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
  const entity = (payload.payload as Record<string, unknown>)?.subscription
    ?.entity as Record<string, unknown> | undefined;

  if (!entity) {
    // payment.failed may not carry a subscription entity — log and acknowledge
    console.warn(`No subscription entity in event: ${event}`, payload);
    return new Response("OK", { status: 200 });
  }

  const subscriptionId = entity.id as string;
  const planId = (entity.plan_id as string) ?? "";
  const planSlug = PLAN_SLUG_MAP[planId] ?? "basic";

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
          plan: planSlug,
          subscription_id: subscriptionId,
          subscription_activated_at: new Date().toISOString(),
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

    default:
      console.log(`Unhandled event type: ${event}`);
  }

  return new Response("OK", { status: 200 });
});