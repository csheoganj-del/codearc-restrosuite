/**
 * Supabase Edge Function: billing-reminders
 *
 * Sends payment reminders in the last 3 days of a trial/paid period via:
 *   - WhatsApp (gateway)
 *   - Email (EMAIL_RELAY_URL)
 *
 * On-screen daily reminder is handled client-side (assets/modules/billing-nudge.js).
 *
 * Schedule (Supabase cron / external):
 *   POST every hour (or daily morning IST) with header:
 *     Authorization: Bearer <BILLING_CRON_SECRET or EMAIL_WEBHOOK_SECRET>
 *
 * No grace period after expiry - reminders only while still active/trialing.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  issueAndDeliverInvoice,
  makeInvoiceNumber,
} from "../_shared/billing-invoice.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET =
  Deno.env.get("BILLING_CRON_SECRET") ||
  Deno.env.get("EMAIL_WEBHOOK_SECRET") ||
  "";
const EMAIL_RELAY_URL = Deno.env.get("EMAIL_RELAY_URL") || "";
const EMAIL_RELAY_TOKEN = Deno.env.get("EMAIL_RELAY_TOKEN") || "";
const ZERO_COST_EMAILS_DISABLED =
  (Deno.env.get("ZERO_COST_EMAILS_DISABLED") || "false") === "true";
const WHATSAPP_GATEWAY_URL = (
  Deno.env.get("WHATSAPP_GATEWAY_URL") ||
  Deno.env.get("NGROK_GATEWAY_URL") ||
  ""
).replace(/\/+$/, "");
const WHATSAPP_GATEWAY_TOKEN =
  Deno.env.get("WHATSAPP_GATEWAY_TOKEN") ||
  Deno.env.get("GATEWAY_TOKEN") ||
  "";
const APP_ORIGIN =
  Deno.env.get("ALLOWED_ORIGIN") || "https://restrosuite.codearc.co.in";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  if (!CRON_SECRET) return false;
  const auth = req.headers.get("authorization") || "";
  const secret = req.headers.get("x-cron-secret") || "";
  return (
    secret === CRON_SECRET ||
    auth === `Bearer ${CRON_SECRET}` ||
    auth === `Bearer ${SERVICE_ROLE_KEY}`
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

function planLabel(code: string): string {
  const c = String(code || "").toLowerCase();
  if (c === "express" || c === "starter") return "Express ( 499/mo)";
  if (c === "serve" || c === "growth") return "Serve ( 999/mo)";
  if (c === "command" || c === "enterprise") return "Command ( 2,499/mo)";
  return code || "your plan";
}

function buildEmailHtml(t: {
  name: string;
  slug: string;
  plan_code: string;
  days: number;
  end: string;
  status: string;
}): string {
  const kind = t.status === "trialing" ? "free trial" : "subscription";
  const urgency =
    t.days <= 1
      ? "expires tomorrow / today"
      : `ends in ${t.days} days`;
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px">
  <table width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
    <tr><td style="padding:28px 32px">
      <div style="font-size:20px;font-weight:700;color:#111">RestroSuite payment reminder</div>
      <div style="height:3px;background:#FF4F00;margin:16px 0"></div>
      <p style="color:#374151;line-height:1.6">Hello <strong>${t.name}</strong>,</p>
      <p style="color:#374151;line-height:1.6">
        Your RestroSuite <strong>${kind}</strong> (${planLabel(t.plan_code)})
        <strong>${urgency}</strong> on <strong>${formatDate(t.end)}</strong>.
      </p>
      <p style="color:#374151;line-height:1.6">
        There is <strong>no grace period</strong> after expiry - POS will lock until you renew.
        Renew from Settings   Plan &amp; billing. Period extends from your expiry date (not the payment day).
      </p>
      <p style="margin:24px 0">
        <a href="${APP_ORIGIN}/login?outlet=${encodeURIComponent(t.slug)}"
           style="background:#FF4F00;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">
          Renew now
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280">Outlet ID: ${t.slug}   Plans: Express  499   Serve  999   Command  2,499</p>
    </td></tr>
  </table>
  </body></html>`;
}

function buildWhatsAppText(t: {
  name: string;
  slug: string;
  plan_code: string;
  days: number;
  end: string;
  status: string;
}): string {
  const kind = t.status === "trialing" ? "trial" : "plan";
  return (
    `RestroSuite reminder\n` +
    `${t.name} (${t.slug})\n` +
    `Your ${kind} (${planLabel(t.plan_code)}) ends in ${t.days} day(s) - ${formatDate(t.end)}.\n` +
    `No grace after expiry. Renew in app   Settings   Plan.\n` +
    `Period extends from expiry date.\n` +
    `${APP_ORIGIN}/login`
  );
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!to) {
    console.warn("email skipped: no recipient");
    return false;
  }
  if (ZERO_COST_EMAILS_DISABLED) {
    console.warn("email skipped: ZERO_COST_EMAILS_DISABLED");
    return false;
  }
  if (!EMAIL_RELAY_URL) {
    console.warn("email skipped: EMAIL_RELAY_URL missing");
    return false;
  }
  const payload = { to, subject, html };
  // Prefer gateway /email proxy (cloud → home PC → Apps Script)
  if (WHATSAPP_GATEWAY_URL && WHATSAPP_GATEWAY_TOKEN) {
    try {
      const response = await fetch(`${WHATSAPP_GATEWAY_URL}/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WHATSAPP_GATEWAY_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text().catch(() => "");
      if (response.ok && /success|ok|sent/i.test(text || "success")) return true;
      console.error("email via gateway fail", response.status, text.slice(0, 160));
    } catch (e) {
      console.error("email via gateway error", e);
    }
  }
  // Fallback direct relay
  try {
    const response = await fetch(EMAIL_RELAY_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "RestroSuite-Billing/1.0",
        ...(EMAIL_RELAY_TOKEN
          ? { Authorization: `Bearer ${EMAIL_RELAY_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text().catch(() => "");
    let resJson: Record<string, unknown> = {};
    try { resJson = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    const ok = response.ok && (
      resJson.status === "success" ||
      resJson.status === "ok" ||
      resJson.ok === true ||
      !text ||
      /success|ok|sent/i.test(text)
    );
    if (!ok) console.error("email relay fail", response.status, text.slice(0, 200));
    return ok;
  } catch (e) {
    console.error("email failed", e);
    return false;
  }
}

async function sendWhatsApp(phone: string, text: string): Promise<boolean> {
  if (!phone || !WHATSAPP_GATEWAY_URL || !WHATSAPP_GATEWAY_TOKEN) {
    console.warn("whatsapp skipped: missing phone or gateway config");
    return false;
  }
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  try {
    const res = await fetch(`${WHATSAPP_GATEWAY_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_GATEWAY_TOKEN}`,
      },
      // Gateway expects `phone` (not `to`)
      body: JSON.stringify({ phone: digits, message: text, text }),
    });
    if (!res.ok) {
      console.error("whatsapp HTTP", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("whatsapp failed", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!authorized(req)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Not configured" }, 500);
  }

  // Optional smoke: deliver trial + paid sample invoices (email + WhatsApp)
  let bodyJson: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const cloned = req.clone();
      bodyJson = await cloned.json().catch(() => ({}));
    }
  } catch { /* empty body */ }

  if (String(bodyJson.action || "") === "smoke_email") {
    const to = String(bodyJson.email || Deno.env.get("ADMIN_ALERT_EMAIL") || "").trim();
    const debug: Record<string, unknown> = {
      hasRelay: !!EMAIL_RELAY_URL,
      hasToken: !!EMAIL_RELAY_TOKEN,
      hasGateway: !!(WHATSAPP_GATEWAY_URL && WHATSAPP_GATEWAY_TOKEN),
      zeroCostDisabled: ZERO_COST_EMAILS_DISABLED,
      to: to ? to.replace(/(.{2}).+(@.+)/, "$1***$2") : "",
    };
    try {
      // Prefer same path as production invoices/reminders (gateway proxy)
      const emailOk = await sendEmail(
        to,
        "RestroSuite smoke email " + new Date().toISOString(),
        "<p>Billing 10/10 smoke email from Edge (gateway proxy preferred).</p>",
      );
      debug.via = "sendEmail(gateway-then-relay)";
      return json({ ok: emailOk, debug, email: emailOk });
    } catch (e) {
      debug.error = String((e as Error)?.message || e);
      return json({ ok: false, debug, email: false });
    }
  }

  if (String(bodyJson.action || "") === "smoke_invoices") {
    try {
      const email = String(bodyJson.email || Deno.env.get("ADMIN_ALERT_EMAIL") || "").trim();
      const phone = String(bodyJson.phone || "").trim();
      const name = String(bodyJson.name || "Smoke Test Outlet");
      const slug = String(bodyJson.slug || "smoke-invoice");
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + 30 * 86400000);
      const paidEnd = new Date(trialStart.getTime() + 30 * 86400000);
      const trialNo = makeInvoiceNumber("trial");
      const paidNo = makeInvoiceNumber("subscription");
      const trial = await issueAndDeliverInvoice({
        kind: "trial",
        invoiceNumber: trialNo,
        invoiceDate: trialStart,
        buyerName: name,
        buyerSlug: slug,
        buyerEmail: email,
        buyerPhone: phone,
        buyerAddress: "Sheoganj, Rajasthan",
        planCode: "serve",
        planName: "Serve (Trial)",
        billingInterval: "trial",
        periodStart: trialStart.toISOString(),
        periodEnd: trialEnd.toISOString(),
        amountTotal: 0,
        paymentMethod: "Trial - no charge",
        notes: "10/10 smoke test - trial confirmation PDF",
      });
      const paid = await issueAndDeliverInvoice({
        kind: "subscription",
        invoiceNumber: paidNo,
        invoiceDate: trialStart,
        buyerName: name,
        buyerSlug: slug,
        buyerEmail: email,
        buyerPhone: phone,
        buyerAddress: "Sheoganj, Rajasthan",
        planCode: "serve",
        planName: "Serve",
        billingInterval: "monthly",
        periodStart: trialStart.toISOString(),
        periodEnd: paidEnd.toISOString(),
        amountTotal: 999,
        paymentId: "pay_SMOKE_TEST",
        paymentMethod: "Razorpay",
        notes: "10/10 smoke test - paid tax invoice PDF",
      });
      return json({
        ok: true,
        smoke: true,
        trial: { invoice: trialNo, email: trial.email, whatsapp: trial.whatsapp },
        paid: { invoice: paidNo, email: paid.email, whatsapp: paid.whatsapp },
      });
    } catch (e) {
      console.error("smoke_invoices failed", e);
      return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
    }
  }

  const now = Date.now();
  const in3Days = new Date(now + 3 * 86400000 + 3600000).toISOString(); // small buffer
  const nowIso = new Date(now).toISOString();

  // Active or trialing tenants whose period ends within 3 days (and not already past)
  const { data: tenants, error } = await supabase
    .from("saas_tenants")
    .select(
      "id, name, slug, email, phone, plan_code, subscription_status, subscription_current_period_end, last_billing_reminder_day, last_billing_reminder_at",
    )
    .in("subscription_status", ["trialing", "active", "past_due"])
    .not("subscription_current_period_end", "is", null)
    .gte("subscription_current_period_end", nowIso)
    .lte("subscription_current_period_end", in3Days);

  if (error) {
    console.error("query failed", error);
    return json({ error: "Query failed", details: error.message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const t of tenants || []) {
    const endIso = t.subscription_current_period_end as string;
    const endMs = new Date(endIso).getTime();
    const days = Math.max(1, Math.ceil((endMs - now) / 86400000));
    // Only day 1, 2, 3 buckets
    if (days > 3) continue;
    const dayBucket = days <= 1 ? 1 : days === 2 ? 2 : 3;

    // One reminder per day-bucket (not every cron hour)
    if (Number(t.last_billing_reminder_day) === dayBucket) {
      const lastAt = t.last_billing_reminder_at
        ? new Date(t.last_billing_reminder_at).getTime()
        : 0;
      // Skip if already reminded for this bucket within 20 hours
      if (lastAt && now - lastAt < 20 * 3600 * 1000) {
        results.push({ slug: t.slug, skipped: "already_sent", dayBucket });
        continue;
      }
    }

    const ctx = {
      name: String(t.name || t.slug),
      slug: String(t.slug || ""),
      plan_code: String(t.plan_code || "serve"),
      days: dayBucket,
      end: endIso,
      status: String(t.subscription_status || ""),
    };

    const subject =
      dayBucket === 1
        ? `RestroSuite: plan ends today - renew to keep POS open (${ctx.slug})`
        : `RestroSuite: ${dayBucket} days left on your plan (${ctx.slug})`;

    const emailOk = await sendEmail(
      String(t.email || ""),
      subject,
      buildEmailHtml(ctx),
    );
    const waOk = await sendWhatsApp(
      String(t.phone || ""),
      buildWhatsAppText(ctx),
    );

    await supabase
      .from("saas_tenants")
      .update({
        last_billing_reminder_day: dayBucket,
        last_billing_reminder_at: new Date().toISOString(),
        last_billing_reminder_channels: { email: emailOk, whatsapp: waOk },
      })
      .eq("id", t.id);

    await supabase.from("saas_billing_events").insert({
      tenant_id: t.id,
      event_type: "billing_reminder",
      channel: emailOk || waOk ? "multi" : "none",
      payload: {
        day_bucket: dayBucket,
        email: emailOk,
        whatsapp: waOk,
        period_end: endIso,
      },
    });

    results.push({
      slug: t.slug,
      dayBucket,
      email: emailOk,
      whatsapp: waOk,
    });
  }

  // Mark fully expired tenants (no grace)
  const { data: expiredRows } = await supabase
    .from("saas_tenants")
    .select("id")
    .in("subscription_status", ["trialing", "active", "past_due"])
    .not("subscription_current_period_end", "is", null)
    .lt("subscription_current_period_end", nowIso);

  if (expiredRows?.length) {
    await supabase
      .from("saas_tenants")
      .update({ subscription_status: "expired" })
      .in(
        "id",
        expiredRows.map((r) => r.id),
      );
  }

  return json({
    ok: true,
    reminded: results.length,
    expired_marked: expiredRows?.length || 0,
    results,
  });
});
