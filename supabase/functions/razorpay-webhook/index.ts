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
import { normalizePlanCode } from "../_shared/paid-access.ts";
import {
  activatePaidPlanFromPayment,
  settleBillFromPayment,
} from "../_shared/activate-paid-plan.ts";

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
  plan_starter_monthly: "express",
  plan_growth_monthly: "serve",
  plan_enterprise_monthly: "command",
  plan_express_monthly: "express",
  plan_serve_monthly: "serve",
  plan_command_monthly: "command",
  plan_basic_monthly: "express",
  plan_standard_monthly: "serve",
  plan_pro_monthly: "serve",
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
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Idempotency guard ─────────────────────────────────────────────────────
  // Claim the event id first. If processing fails we DELETE it so Razorpay
  // retries can actually re-apply (insert-before-success used to swallow retries).
  if (eventId) {
    const { error: idempotencyError } = await supabase
      .from("processed_webhook_events")
      .insert({ event_id: eventId, processed_at: new Date().toISOString() });

    if (idempotencyError) {
      if (idempotencyError.code === "23505") {
        console.log(`Duplicate event ${eventId} — already processed, acknowledging.`);
        return new Response("OK — already processed", { status: 200 });
      }
      console.error("Idempotency insert failed:", idempotencyError);
      return new Response("DB error", { status: 500 });
    }
  }

  const payloadBag = (payload.payload || {}) as Record<string, unknown>;
  const subscriptionEntity = (payloadBag.subscription as Record<string, unknown> | undefined)
    ?.entity as Record<string, unknown> | undefined;
  const paymentEntity = (payloadBag.payment as Record<string, unknown> | undefined)
    ?.entity as Record<string, unknown> | undefined;
  const accountEntity = (payloadBag.account as Record<string, unknown> | undefined)
    ?.entity as Record<string, unknown> | undefined;

  const entity = subscriptionEntity;
  const subscriptionId = entity ? String(entity.id || "") : "";
  const planId = entity ? String(entity.plan_id || "") : "";
  const planSlug = normalizePlanCode(PLAN_SLUG_MAP[planId] || "express");

  const notes = ((entity && entity.notes) || {}) as Record<string, string>;
  const tenantUsername = String(notes.tenant_username || "");

  const currentEndIso = (() => {
    const raw = Number((entity && (entity as Record<string, unknown>).current_end) || 0);
    if (raw > 0) return new Date(raw * 1000).toISOString();
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  })();

  async function failRetry(message: string, err?: unknown) {
    console.error(message, err);
    if (eventId) {
      try {
        await supabase.from("processed_webhook_events").delete().eq("event_id", eventId);
      } catch (_) { /* retry will re-insert */ }
    }
    return new Response("DB error", { status: 500 });
  }

  async function resolveTenantFromPaymentNotes(pNotes: Record<string, string>) {
    const id = String(pNotes.tenant_id || "").trim();
    const slug = String(pNotes.tenant_slug || pNotes.tenant || "").trim();
    const username = String(pNotes.tenant_username || "").trim();
    if (id) {
      const { data } = await supabase.from("saas_tenants").select("id").eq("id", id).maybeSingle();
      if (data) return data;
    }
    if (slug) {
      const { data } = await supabase.from("saas_tenants").select("id").eq("slug", slug).maybeSingle();
      if (data) return data;
    }
    if (username) {
      const { data } = await supabase.from("saas_tenants").select("id").eq("username", username).maybeSingle();
      if (data) return data;
    }
    return null;
  }

  try {
  switch (event) {
    // ── Subscription activated (first payment succeeded) ──────────────────
    case "subscription.activated": {
      if (!tenantUsername) {
        console.warn("subscription.activated: no tenant_username in notes");
        break;
      }
      const { error } = await supabase
        .from("saas_tenants")
        .update({
          status: "approved",
          plan_code: planSlug,
          subscription_id: subscriptionId,
          subscription_activated_at: new Date().toISOString(),
          subscription_status: "active",
          subscription_current_period_end: currentEndIso,
        })
        .eq("username", tenantUsername);

      if (error) return await failRetry("DB update failed (activated):", error);
      console.log(`Tenant ${tenantUsername} activated on plan ${planSlug} (paid until ${currentEndIso})`);
      break;
    }

    // ── Recurring charge succeeded (auto-renew) ────────────────────────────
    case "subscription.charged": {
      if (!tenantUsername) {
        console.warn("subscription.charged: no tenant_username in notes");
        break;
      }
      const { error } = await supabase
        .from("saas_tenants")
        .update({
          status: "approved",
          subscription_status: "active",
          subscription_current_period_end: currentEndIso,
          subscription_renewed_at: new Date().toISOString(),
        })
        .eq("username", tenantUsername);

      if (error) return await failRetry("DB update failed (charged):", error);
      console.log(`Tenant ${tenantUsername} renewed (paid until ${currentEndIso})`);
      break;
    }

    // ── Subscription cancelled by merchant or customer ─────────────────────
    case "subscription.cancelled":
    case "subscription.completed": {
      if (!tenantUsername) {
        console.warn(`${event}: no tenant_username in notes`);
        break;
      }
      const { error } = await supabase
        .from("saas_tenants")
        .update({
          subscription_status: "canceled",
          subscription_cancelled_at: new Date().toISOString(),
        })
        .eq("username", tenantUsername);

      if (error) return await failRetry("DB update failed (cancelled):", error);
      console.log(`Tenant ${tenantUsername} subscription cancelled/completed (paid days still honoured until period end)`);
      break;
    }

    // ── Payment failed ─────────────────────────────────────────────────────
    case "payment.failed": {
      const paymentNotes =
        (paymentEntity?.notes as Record<string, string>) ?? {};
      const purpose = String(paymentNotes.purpose || "").toLowerCase();
      // Never suspend the workspace for a diner/POS bill failure.
      if (purpose && purpose !== "plan" && purpose !== "subscription") {
        console.log("payment.failed ignored for non-plan purpose", purpose);
        break;
      }
      const failedTenantUsername =
        paymentNotes.tenant_username || tenantUsername;
      if (!failedTenantUsername) break;
      const { error } = await supabase
        .from("saas_tenants")
        .update({ subscription_status: "past_due" })
        .eq("username", failedTenantUsername)
        .in("subscription_status", ["active", "trialing", "past_due"]);

      if (error) return await failRetry("DB update failed (payment.failed):", error);
      console.log(`Payment failed for tenant ${failedTenantUsername}`);
      break;
    }

    case "payment.captured": {
      if (!paymentEntity) {
        console.warn("payment.captured: no payment entity");
        break;
      }

      const pNotes = (paymentEntity.notes as Record<string, string>) ?? {};
      const purpose = String(pNotes.purpose || "").toLowerCase();
      const tenantRow = await resolveTenantFromPaymentNotes(pNotes);

      if (purpose === "plan" || purpose === "subscription") {
        if (!tenantRow) {
          console.error("payment.captured plan: tenant not found", pNotes);
          break;
        }
        try {
          await activatePaidPlanFromPayment({
            supabase,
            tenantId: tenantRow.id,
            payment: paymentEntity,
            planCode: pNotes.plan_code,
            billingInterval: pNotes.billing_interval,
            requireTenantMatch: true,
          });
        } catch (e) {
          return await failRetry("payment.captured plan activate failed", e);
        }
        break;
      }

      if ((purpose === "bill" || purpose === "pos") && (pNotes.bill_no || pNotes.order_id)) {
        if (!tenantRow) {
          console.error("payment.captured bill: tenant not found", pNotes);
          break;
        }
        try {
          await settleBillFromPayment({
            supabase,
            tenantId: tenantRow.id,
            billNo: String(pNotes.bill_no || pNotes.order_id || ""),
            payment: paymentEntity,
          });
        } catch (e) {
          console.warn("payment.captured bill settle", e);
        }
      }

      const orderId = pNotes.order_id || String(paymentEntity.receipt || "");
      const tenantSlug = pNotes.tenant_slug || "";
      if (orderId && (tenantSlug || tenantRow)) {
        const routeTenant = tenantRow || (await supabase
          .from("saas_tenants")
          .select("id")
          .eq("slug", tenantSlug)
          .maybeSingle()).data;
        if (routeTenant) {
          const { error: updateErr } = await supabase
            .from("doppio_pending_orders")
            .update({
              status: "Paid",
              payment_method: "Razorpay",
            })
            .eq("tenant_id", routeTenant.id)
            .eq("order_id", orderId);
          if (updateErr) return await failRetry("payment.captured: failed to update order status", updateErr);
          console.log(`Order ${orderId} marked Paid via Razorpay for tenant ${tenantSlug}`);
        }
      }
      break;
    }

    case "account.activated": {
      const accountId = (accountEntity?.id as string) || "";
      if (!accountId) {
        console.warn("account.activated: no account id in payload");
        break;
      }

      const { error: activateErr } = await supabase
        .from("saas_tenants")
        .update({
          razorpay_route_enabled: true,
          razorpay_kyc_status: "activated",
        })
        .eq("razorpay_account_id", accountId);

      if (activateErr) return await failRetry("account.activated: DB update failed", activateErr);
      console.log(`Razorpay Route activated for account ${accountId}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event}`);
  }
  } catch (e) {
    return await failRetry("webhook handler crashed", e);
  }

  return new Response("OK", { status: 200 });
});