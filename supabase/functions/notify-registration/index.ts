// Supabase Edge Function: notify-registration
// Deploy to: supabase/functions/notify-registration/index.ts
// Triggered by: Supabase Database Webhook on INSERT to public.saas_tenants
//
// This function sends registration & approval emails using Gmail SMTP via fetch.
// It runs in Supabase's cloud — completely independent of the WhatsApp gateway.
// Email ALWAYS works even if the gateway is 100% down.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") || "csheoganj2024@gmail.com";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "xvkywpecxtqysuob";
const FROM_NAME = "CodeArc RestoSuite";
const ADMIN_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "csheoganj@gmail.com";

// Simple base64 encoder for SMTP AUTH
function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

// Send email via Gmail SMTP using Deno's built-in TCP (via smtp library)
// We use the Deno SMTP library available as a CDN import
import { SmtpClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const client = new SmtpClient();
  await client.connectTLS({
    hostname: "smtp.gmail.com",
    port: 465,
    username: GMAIL_USER,
    password: GMAIL_APP_PASSWORD,
  });
  await client.send({
    from: `${FROM_NAME} <${GMAIL_USER}>`,
    to: to,
    subject: subject,
    content: "Please enable HTML to view this email.",
    html: html,
  });
  await client.close();
}

function buildRegistrationEmailHtml(record: Record<string, string>): string {
  const { name, slug, outlet_type, email, phone, username } = record;
  const typeStr = (outlet_type || "cafe").toUpperCase();
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:8px;color:#333;">
    <div style="text-align:center;padding:20px 0;border-bottom:2px solid #C98A4A;margin-bottom:24px;">
      <h1 style="color:#0f172a;font-size:22px;margin:0;">🎉 Registration Received</h1>
      <p style="color:#64748b;font-size:13px;margin:6px 0 0;">CodeArc RestoSuite Platform</p>
    </div>

    <p>Hello,</p>
    <p>Thank you for registering your outlet <strong>${name}</strong> (${typeStr}) with <strong>CodeArc RestoSuite</strong>!</p>

    <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:20px 0;border-left:4px solid #C98A4A;">
      <h3 style="margin-top:0;color:#0f172a;font-size:14px;">📋 Registration Details:</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:5px 0;font-weight:bold;width:150px;">Outlet Name:</td><td>${name}</td></tr>
        <tr><td style="padding:5px 0;font-weight:bold;">Outlet ID (Slug):</td><td><code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;">${slug}</code></td></tr>
        <tr><td style="padding:5px 0;font-weight:bold;">Outlet Type:</td><td>${typeStr}</td></tr>
        <tr><td style="padding:5px 0;font-weight:bold;">Admin Username:</td><td>${username}</td></tr>
        <tr><td style="padding:5px 0;font-weight:bold;">Owner Email:</td><td>${email || "N/A"}</td></tr>
        <tr><td style="padding:5px 0;font-weight:bold;">WhatsApp:</td><td>+${phone || "N/A"}</td></tr>
        <tr><td style="padding:5px 0;font-weight:bold;">Status:</td>
          <td><span style="background:#fef3c7;color:#d97706;padding:3px 10px;border-radius:12px;font-weight:bold;font-size:12px;">⏳ Pending Approval</span></td>
        </tr>
      </table>
    </div>

    <p>Our team at CodeArc is reviewing your request. You will receive another notification on WhatsApp and email as soon as your account is <strong>approved and active</strong>.</p>

    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:12px;color:#666;margin-bottom:6px;">Need support? Contact us:</p>
    <ul style="font-size:12px;color:#666;padding-left:20px;margin-top:0;">
      <li>📧 Email: <a href="mailto:hello@codearc.co.in" style="color:#C98A4A;">hello@codearc.co.in</a></li>
      <li>📞 Call: +91 99837 21179</li>
      <li>🌐 Web: <a href="https://codearc.co.in" style="color:#C98A4A;">codearc.co.in</a></li>
    </ul>
    <p style="font-size:11px;color:#999;margin-top:20px;text-align:center;">This is an automated notification from CodeArc RestoSuite.</p>
  </div>`;
}

function buildApprovalEmailHtml(record: Record<string, string>): string {
  const { name, slug, username } = record;
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:8px;color:#333;">
    <div style="text-align:center;padding:20px 0;border-bottom:2px solid #22c55e;margin-bottom:24px;">
      <h1 style="color:#16a34a;font-size:22px;margin:0;">🎉 Account Approved & Active!</h1>
      <p style="color:#64748b;font-size:13px;margin:6px 0 0;">CodeArc RestoSuite Platform</p>
    </div>

    <p>Hello,</p>
    <p>Great news! Your registration for <strong>${name}</strong> has been <strong style="color:#16a34a;">APPROVED</strong> by the CodeArc Operations Team.</p>
    <p>Your account is now <strong>fully active</strong> and ready to use!</p>

    <div style="background:#f0fdf4;padding:16px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;">
      <h3 style="margin-top:0;color:#0f172a;font-size:14px;">🔑 Your Login Credentials:</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:5px 0;font-weight:bold;width:150px;">Outlet ID (Slug):</td>
          <td><code style="background:#dcfce7;padding:2px 6px;border-radius:4px;">${slug}</code></td></tr>
        <tr><td style="padding:5px 0;font-weight:bold;">Admin Username:</td><td>${username}</td></tr>
      </table>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://codearc-restrosuite.vercel.app/login" style="background:#22c55e;color:white;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">Access Login Portal →</a>
    </div>

    <p style="font-size:13px;color:#555;">Please log in and configure your menu, inventory, tax settings, and staff to begin operations immediately.</p>

    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <ul style="font-size:12px;color:#666;padding-left:20px;">
      <li>📧 Email: <a href="mailto:hello@codearc.co.in" style="color:#22c55e;">hello@codearc.co.in</a></li>
      <li>📞 Call: +91 99837 21179</li>
    </ul>
    <p style="font-size:11px;color:#999;margin-top:20px;text-align:center;">Welcome to the CodeArc RestoSuite platform!</p>
  </div>`;
}

function buildAdminNewRegistrationEmailHtml(record: Record<string, string>): string {
  const { name, slug, outlet_type, email, phone, username } = record;
  const typeStr = (outlet_type || "cafe").toUpperCase();
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:8px;color:#333;">
    <div style="text-align:center;padding:16px 0;border-bottom:2px solid #3b82f6;margin-bottom:20px;">
      <h1 style="color:#1e40af;font-size:20px;margin:0;">🔔 New Outlet Registration</h1>
      <p style="color:#64748b;font-size:12px;margin:4px 0 0;">Action Required — Review & Approve</p>
    </div>
    <p>A new outlet has registered on the RestoSuite portal. Please review and approve it from the Super Admin dashboard.</p>

    <div style="background:#eff6ff;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #3b82f6;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;font-weight:bold;width:140px;">Business Name:</td><td><strong>${name}</strong></td></tr>
        <tr><td style="padding:4px 0;font-weight:bold;">Outlet ID:</td><td><code style="background:#dbeafe;padding:2px 6px;border-radius:4px;">${slug}</code></td></tr>
        <tr><td style="padding:4px 0;font-weight:bold;">Type:</td><td>${typeStr}</td></tr>
        <tr><td style="padding:4px 0;font-weight:bold;">Admin Username:</td><td>${username}</td></tr>
        <tr><td style="padding:4px 0;font-weight:bold;">Owner Email:</td><td>${email || "N/A"}</td></tr>
        <tr><td style="padding:4px 0;font-weight:bold;">WhatsApp:</td><td>+${phone || "N/A"}</td></tr>
        <tr><td style="padding:4px 0;font-weight:bold;">Registered At:</td><td>${now} IST</td></tr>
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="https://codearc-restrosuite.vercel.app/login" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:13px;display:inline-block;">Open Super Admin Dashboard →</a>
    </div>
    <p style="font-size:11px;color:#999;text-align:center;">Automated notification from CodeArc RestoSuite.</p>
  </div>`;
}

serve(async (req: Request) => {
  // Allow only POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body: { type?: string; table?: string; record?: Record<string, string>; old_record?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { type, table, record, old_record } = body;

  if (!record || table !== "saas_tenants") {
    return new Response(JSON.stringify({ status: "ignored", reason: "Not a saas_tenants event" }), { status: 200 });
  }

  const errors: string[] = [];

  try {
    // ---- NEW REGISTRATION (INSERT) ----
    if (type === "INSERT") {
      const customerEmail = record.email;
      const adminEmail = ADMIN_EMAIL;

      // 1. Send confirmation to customer
      if (customerEmail) {
        try {
          await sendEmail(
            customerEmail,
            `Registration Received – CodeArc RestoSuite (${record.name})`,
            buildRegistrationEmailHtml(record)
          );
          console.log(`[Edge Email] Registration confirmation sent to customer: ${customerEmail}`);
        } catch (err) {
          console.error(`[Edge Email Error] Customer email failed:`, err);
          errors.push(`customer_email: ${err}`);
        }
      }

      // 2. Send admin notification
      try {
        await sendEmail(
          adminEmail,
          `🔔 New Registration: ${record.name} (${record.slug})`,
          buildAdminNewRegistrationEmailHtml(record)
        );
        console.log(`[Edge Email] Admin notification sent to: ${adminEmail}`);
      } catch (err) {
        console.error(`[Edge Email Error] Admin email failed:`, err);
        errors.push(`admin_email: ${err}`);
      }
    }

    // ---- STATUS UPDATE: APPROVED ----
    if (type === "UPDATE") {
      const oldStatus = old_record?.status;
      const newStatus = record.status;

      if (newStatus === "approved" && oldStatus !== "approved") {
        const customerEmail = record.email;
        if (customerEmail) {
          try {
            await sendEmail(
              customerEmail,
              `✅ Account Approved & Active – CodeArc RestoSuite (${record.name})`,
              buildApprovalEmailHtml(record)
            );
            console.log(`[Edge Email] Approval email sent to: ${customerEmail}`);
          } catch (err) {
            console.error(`[Edge Email Error] Approval email failed:`, err);
            errors.push(`approval_email: ${err}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("[Edge Function] Unexpected error:", err);
    return new Response(JSON.stringify({ status: "error", error: String(err) }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      status: errors.length === 0 ? "success" : "partial",
      errors: errors.length > 0 ? errors : undefined,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
