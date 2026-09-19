/**
 * Paid-plan activation — Razorpay capture is the only source of truth.
 * Never trust a browser "payment success" flag.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ALLOWED_PLAN_CODES,
  extendPeriodEnd,
  normalizePlanCode,
} from "./paid-access.ts";
import {
  issueAndDeliverInvoice,
  makeInvoiceNumber,
  planDisplayName,
  planListPrice,
} from "./billing-invoice.ts";

export type SupabaseAdmin = ReturnType<typeof createClient>;

function basicAuth(keyId: string, keySecret: string): string {
  return "Basic " + btoa(`${keyId}:${keySecret}`);
}

export async function fetchRazorpayPayment(
  paymentId: string,
  keyId: string,
  keySecret: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: basicAuth(keyId, keySecret) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json && json.error && (json.error.description || json.error.code)) ||
        "Could not load Razorpay payment",
    );
  }
  return json as Record<string, unknown>;
}

export async function fetchRazorpayOrder(
  orderId: string,
  keyId: string,
  keySecret: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: basicAuth(keyId, keySecret) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json && json.error && (json.error.description || json.error.code)) ||
        "Could not load Razorpay order",
    );
  }
  return json as Record<string, unknown>;
}

function notesOf(entity: Record<string, unknown>): Record<string, string> {
  const n = entity.notes;
  if (!n || typeof n !== "object" || Array.isArray(n)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
    out[k] = String(v ?? "");
  }
  return out;
}

async function expectedPaise(
  supabase: SupabaseAdmin,
  planCode: string,
  interval: "monthly" | "yearly",
): Promise<number> {
  const code = normalizePlanCode(planCode);
  const { data } = await supabase
    .from("saas_plans")
    .select("plan_code, price_monthly, price_yearly")
    .eq("plan_code", code)
    .maybeSingle();
  let rupees = 0;
  if (data) {
    rupees = interval === "yearly"
      ? Number(data.price_yearly) || 0
      : Number(data.price_monthly) || 0;
  }
  if (!(rupees > 0)) rupees = planListPrice(code, interval);
  return Math.round(rupees * 100);
}

export type ActivateResult = {
  ok: true;
  already?: boolean;
  tenant_id: string;
  plan_code: string;
  billing_interval: "monthly" | "yearly";
  subscription_status: "active";
  subscription_current_period_end: string;
  payment_id: string;
  order_id: string | null;
};

export async function claimPaymentId(
  supabase: SupabaseAdmin,
  paymentId: string,
  row: {
    tenant_id?: string | null;
    purpose: string;
    order_id?: string | null;
    amount_paise?: number | null;
    meta?: Record<string, unknown>;
  },
): Promise<{ claimed: boolean; existing: boolean }> {
  const { data, error } = await supabase
    .from("saas_captured_payments")
    .insert({
      payment_id: paymentId,
      tenant_id: row.tenant_id || null,
      purpose: row.purpose,
      order_id: row.order_id || null,
      amount_paise: row.amount_paise ?? null,
      meta: row.meta || {},
    })
    .select("payment_id")
    .maybeSingle();

  if (!error && data) return { claimed: true, existing: false };
  if (error && error.code === "23505") return { claimed: false, existing: true };
  if (error) {
    console.error("[saas_captured_payments] insert", error);
    throw new Error("Could not record payment");
  }
  return { claimed: false, existing: true };
}

export async function releasePaymentClaim(
  supabase: SupabaseAdmin,
  paymentId: string,
): Promise<void> {
  try {
    await supabase.from("saas_captured_payments").delete().eq("payment_id", paymentId);
  } catch (e) {
    console.warn("[saas_captured_payments] release failed", e);
  }
}

export async function activatePaidPlanFromPayment(opts: {
  supabase: SupabaseAdmin;
  tenantId: string;
  payment: Record<string, unknown>;
  planCode?: string;
  billingInterval?: string;
  requireTenantMatch?: boolean;
}): Promise<ActivateResult> {
  const payment = opts.payment;
  const paymentId = String(payment.id || "").trim();
  const status = String(payment.status || "").toLowerCase();
  if (!paymentId) throw new Error("Missing payment id");
  if (status !== "captured") {
    throw new Error("Payment is not captured");
  }

  const notes = notesOf(payment);
  const orderId = String(payment.order_id || notes.order_id || "").trim() || null;
  const interval: "monthly" | "yearly" =
    String(opts.billingInterval || notes.billing_interval || "monthly").toLowerCase() ===
      "yearly"
      ? "yearly"
      : "monthly";

  const rawPlan = String(opts.planCode || notes.plan_code || "").trim().toLowerCase();
  if (!rawPlan || !ALLOWED_PLAN_CODES.has(rawPlan)) {
    throw new Error("Unknown plan");
  }
  const planCode = normalizePlanCode(rawPlan);

  const noteTenant = String(
    notes.tenant_id || notes.tenant || notes.tenant_slug || "",
  ).trim();
  if (opts.requireTenantMatch !== false && noteTenant) {
    const { data: trow } = await opts.supabase
      .from("saas_tenants")
      .select("id, slug, username")
      .eq("id", opts.tenantId)
      .maybeSingle();
    if (!trow) throw new Error("Workspace not found");
    const ok =
      noteTenant === trow.id ||
      noteTenant === trow.slug ||
      noteTenant === trow.username;
    if (!ok) throw new Error("Payment does not belong to this outlet");
  }

  const paidPaise = Math.round(Number(payment.amount) || 0);
  const needPaise = await expectedPaise(opts.supabase, planCode, interval);
  if (!(needPaise >= 100)) throw new Error("Plan price is not configured");
  if (paidPaise < needPaise) {
    throw new Error("Paid amount does not match the selected plan");
  }

  const existing = await opts.supabase
    .from("saas_captured_payments")
    .select("payment_id, tenant_id, purpose")
    .eq("payment_id", paymentId)
    .maybeSingle();

  const { data: tenant } = await opts.supabase
    .from("saas_tenants")
    .select(
      "id, name, slug, email, phone, plan_code, subscription_status, subscription_current_period_end",
    )
    .eq("id", opts.tenantId)
    .maybeSingle();
  if (!tenant) throw new Error("Workspace not found");

  if (existing.data) {
    return {
      ok: true,
      already: true,
      tenant_id: tenant.id,
      plan_code: normalizePlanCode(String(tenant.plan_code || planCode)),
      billing_interval: interval,
      subscription_status: "active",
      subscription_current_period_end:
        tenant.subscription_current_period_end || extendPeriodEnd(null, interval),
      payment_id: paymentId,
      order_id: orderId,
    };
  }

  const claim = await claimPaymentId(opts.supabase, paymentId, {
    tenant_id: tenant.id,
    purpose: "plan",
    order_id: orderId,
    amount_paise: paidPaise,
    meta: { plan_code: planCode, billing_interval: interval },
  });
  if (!claim.claimed && claim.existing) {
    return {
      ok: true,
      already: true,
      tenant_id: tenant.id,
      plan_code: normalizePlanCode(String(tenant.plan_code || planCode)),
      billing_interval: interval,
      subscription_status: "active",
      subscription_current_period_end:
        tenant.subscription_current_period_end || extendPeriodEnd(null, interval),
      payment_id: paymentId,
      order_id: orderId,
    };
  }

  const periodEnd = extendPeriodEnd(tenant.subscription_current_period_end, interval);
  const nowIso = new Date().toISOString();

  const { error: updErr } = await opts.supabase
    .from("saas_tenants")
    .update({
      status: "approved",
      plan_code: planCode,
      subscription_status: "active",
      subscription_current_period_end: periodEnd,
      subscription_activated_at: nowIso,
      subscription_renewed_at: nowIso,
    })
    .eq("id", tenant.id);

  if (updErr) {
    await releasePaymentClaim(opts.supabase, paymentId);
    throw new Error("Could not activate plan");
  }

  try {
    const invoiceNumber = makeInvoiceNumber("subscription");
    const amountTotal = paidPaise / 100;
    const delivered = await issueAndDeliverInvoice({
      kind: "subscription",
      invoiceNumber,
      buyerName: tenant.name,
      buyerSlug: tenant.slug,
      buyerEmail: tenant.email,
      buyerPhone: tenant.phone,
      planCode,
      planName: planDisplayName(planCode),
      billingInterval: interval,
      periodStart: nowIso,
      periodEnd,
      amountTotal,
      currency: String(payment.currency || "INR"),
      paymentId,
      orderId,
      paymentMethod: "Razorpay",
    });
    await opts.supabase.from("saas_invoices").insert({
      tenant_id: tenant.id,
      invoice_number: invoiceNumber,
      kind: "subscription",
      plan_code: planCode,
      billing_interval: interval,
      currency: String(payment.currency || "INR"),
      amount_subtotal: delivered.amountSubtotal,
      amount_tax: delivered.amountTax,
      amount_total: delivered.amountTotal,
      period_start: nowIso,
      period_end: periodEnd,
      payment_id: paymentId,
      order_id: orderId,
      payment_method: "Razorpay",
      buyer_name: tenant.name,
      buyer_email: tenant.email,
      buyer_phone: tenant.phone,
      buyer_slug: tenant.slug,
      status: "paid",
      pdf_sent_email: delivered.email,
      pdf_sent_whatsapp: delivered.whatsapp,
    });
  } catch (invErr) {
    console.error("[activate-paid-plan] invoice", invErr);
  }

  return {
    ok: true,
    tenant_id: tenant.id,
    plan_code: planCode,
    billing_interval: interval,
    subscription_status: "active",
    subscription_current_period_end: periodEnd,
    payment_id: paymentId,
    order_id: orderId,
  };
}

export async function settleBillFromPayment(opts: {
  supabase: SupabaseAdmin;
  tenantId: string;
  billNo: string;
  payment: Record<string, unknown>;
}): Promise<{ ok: true; already?: boolean; bill_no: string; payment_id: string }> {
  const paymentId = String(opts.payment.id || "").trim();
  const status = String(opts.payment.status || "").toLowerCase();
  if (!paymentId) throw new Error("Missing payment id");
  if (status !== "captured") throw new Error("Payment is not captured");

  const paidPaise = Math.round(Number(opts.payment.amount) || 0);
  const billNo = String(opts.billNo || "").trim();
  if (!billNo) throw new Error("Missing bill number");

  const { data: bill, error } = await opts.supabase
    .from("doppio_bills")
    .select("id, order_id, total, payment_method, razorpay_payment_id")
    .eq("tenant_id", opts.tenantId)
    .eq("order_id", billNo)
    .maybeSingle();

  if (error) throw new Error("Could not load bill");
  if (!bill) throw new Error("Bill not found");

  if (bill.razorpay_payment_id && String(bill.razorpay_payment_id) === paymentId) {
    return { ok: true, already: true, bill_no: billNo, payment_id: paymentId };
  }
  if (bill.razorpay_payment_id) {
    throw new Error("Bill already settled with a different payment");
  }

  const duePaise = Math.round(Number(bill.total) * 100);
  if (duePaise >= 100 && paidPaise + 100 < duePaise) {
    throw new Error("Paid amount is less than the bill total");
  }

  const existing = await opts.supabase
    .from("saas_captured_payments")
    .select("payment_id")
    .eq("payment_id", paymentId)
    .maybeSingle();
  if (existing.data) {
    // Payment already used — only OK if it was for this bill.
    const { data: same } = await opts.supabase
      .from("doppio_bills")
      .select("order_id")
      .eq("razorpay_payment_id", paymentId)
      .maybeSingle();
    if (same && String(same.order_id) === billNo) {
      return { ok: true, already: true, bill_no: billNo, payment_id: paymentId };
    }
    throw new Error("This payment was already used");
  }

  const claim = await claimPaymentId(opts.supabase, paymentId, {
    tenant_id: opts.tenantId,
    purpose: "bill",
    order_id: billNo,
    amount_paise: paidPaise,
    meta: { bill_no: billNo },
  });
  if (!claim.claimed && claim.existing) {
    return { ok: true, already: true, bill_no: billNo, payment_id: paymentId };
  }

  const { error: updErr } = await opts.supabase
    .from("doppio_bills")
    .update({
      payment_method: "Razorpay",
      status: "paid",
      razorpay_payment_id: paymentId,
      razorpay_order_id: String(opts.payment.order_id || "") || null,
    })
    .eq("id", bill.id)
    .eq("tenant_id", opts.tenantId);

  if (updErr) {
    await releasePaymentClaim(opts.supabase, paymentId);
    throw new Error("Could not mark bill paid");
  }

  return { ok: true, bill_no: billNo, payment_id: paymentId };
}
