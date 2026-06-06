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
// Send email via Google Apps Script Web App Relay
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const relayUrl = Deno.env.get("EMAIL_RELAY_URL");
  if (!relayUrl) {
    throw new Error("EMAIL_RELAY_URL environment variable is not configured.");
  }

  const response = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ to, subject, html }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Relay request failed: ${response.status} - ${errText}`);
  }

  const resJson = await response.json();
  if (resJson.status !== "success") {
    throw new Error(`Relay returned failure status: ${JSON.stringify(resJson)}`);
  }
}

function buildRegistrationEmailHtml(record: Record<string, string>): string {
  const { name, slug, outlet_type, email, phone, username } = record;
  const typeStr = (outlet_type || "cafe").toUpperCase();
  const displayType = typeStr === "RESTAURANT" ? "Restaurant" : typeStr === "CAFE" ? "Cafe" : typeStr;

  // Format phone number nicely (e.g., +91 99837 21179)
  let targetPhone = phone ? phone.replace(/\D/g, '') : '';
  if (targetPhone.length === 10 && !targetPhone.startsWith('65') && !targetPhone.startsWith('45') && !targetPhone.startsWith('47') && !targetPhone.startsWith('96') && !targetPhone.startsWith('91')) {
    targetPhone = "91" + targetPhone;
  }
  const formattedPhone = (targetPhone.startsWith('91') && targetPhone.length === 12) 
    ? `+91 ${targetPhone.slice(2, 7)} ${targetPhone.slice(7)}` 
    : (phone ? `+${phone.replace(/\D/g, '')}` : 'N/A');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Registration Received</title>
</head>

<body style="margin:0; padding:0; background:#f8fafc; font-family:Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:40px 15px;">
    <tr>
      <td align="center">

        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:640px; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="padding:35px 40px 20px 40px; text-align:center;">

              <div style="font-size:28px; font-weight:700; color:#111827; margin-bottom:8px;">
                Welcome to CodeArc RestoSuite
              </div>

              <div style="font-size:15px; color:#6b7280; line-height:24px;">
                Your restaurant onboarding request has been received successfully.
              </div>

            </td>
          </tr>

          <!-- Orange Divider -->
          <tr>
            <td>
              <div style="height:4px; background:#f97316;"></div>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:35px 40px 10px 40px;">

              <div style="font-size:15px; color:#374151; line-height:28px;">
                Hello,
              </div>

              <div style="font-size:15px; color:#374151; line-height:28px; margin-top:10px;">
                Thank you for registering your outlet
                <strong>${name}</strong> (${displayType})
                with <strong>CodeArc RestoSuite</strong>.
              </div>

            </td>
          </tr>

          <!-- Details Card -->
          <tr>
            <td style="padding:20px 40px;">

              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:25px;">

                <tr>
                  <td colspan="2"
                    style="font-size:18px; font-weight:700; color:#111827; padding-bottom:20px;">
                    Registration Details
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 0; color:#6b7280; font-size:14px; width:180px;">
                    Outlet Name
                  </td>

                  <td style="padding:10px 0; color:#111827; font-size:14px; font-weight:600;">
                    ${name}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 0; color:#6b7280; font-size:14px;">
                    Outlet ID (Slug)
                  </td>

                  <td style="padding:10px 0;">
                    <span style="
                      background:#e5e7eb;
                      padding:5px 10px;
                      border-radius:6px;
                      font-size:13px;
                      color:#111827;
                      font-family:monospace;">
                      ${slug}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 0; color:#6b7280; font-size:14px;">
                    Outlet Type
                  </td>

                  <td style="padding:10px 0; color:#111827; font-size:14px; font-weight:600;">
                    ${typeStr}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 0; color:#6b7280; font-size:14px;">
                    Admin Username
                  </td>

                  <td style="padding:10px 0; color:#111827; font-size:14px; font-family:monospace;">
                    ${username}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 0; color:#6b7280; font-size:14px;">
                    Owner Email
                  </td>

                  <td style="padding:10px 0; color:#2563eb; font-size:14px;">
                    ${email || 'N/A'}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 0; color:#6b7280; font-size:14px;">
                    WhatsApp
                  </td>

                  <td style="padding:10px 0; color:#111827; font-size:14px;">
                    ${formattedPhone}
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 0; color:#6b7280; font-size:14px;">
                    Status
                  </td>

                  <td style="padding:10px 0;">
                    <span style="
                      display:inline-block;
                      background:#fff7ed;
                      color:#ea580c;
                      padding:7px 14px;
                      border-radius:999px;
                      font-size:13px;
                      font-weight:600;
                      border:1px solid #fdba74;">
                      Pending Approval
                    </span>
                  </td>
                </tr>

              </table>

            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:10px 40px 20px 40px;">

              <div style="font-size:15px; color:#4b5563; line-height:28px;">
                Our team is currently reviewing your registration request.
                Once approved, you will receive another email and WhatsApp
                notification with your login access and onboarding details.
              </div>

            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:10px 40px 35px 40px;">

              <a href="https://codearc.co.in"
                style="
                  background:#f97316;
                  color:#ffffff;
                  text-decoration:none;
                  padding:14px 28px;
                  border-radius:10px;
                  font-size:15px;
                  font-weight:600;
                  display:inline-block;">
                Visit CodeArc
              </a>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="
              border-top:1px solid #e5e7eb;
              padding:30px 40px;
              background:#fcfcfc;">

              <div style="font-size:15px; font-weight:600; color:#111827; margin-bottom:12px;">
                Need help?
              </div>

              <div style="font-size:14px; color:#6b7280; line-height:28px;">
                Email: hello@codearc.co.in<br>
                Phone: +91 99837 21179<br>
                Website: codearc.co.in
              </div>

              <div style="margin-top:20px; font-size:12px; color:#9ca3af;">
                © 2026 CodeArc Technologies. All rights reserved.
              </div>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

function buildApprovalEmailHtml(record: Record<string, string>): string {
  const { name, slug, username } = record;
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:8px;color:#333;">
    <div style="text-align:center;padding:20px 0;border-bottom:2px solid #22c55e;margin-bottom:24px;">
      <h1 style="color:#16a34a;font-size:22px;margin:0;">&#127881; Account Approved & Active!</h1>
      <p style="color:#64748b;font-size:13px;margin:6px 0 0;">CodeArc RestoSuite Platform</p>
    </div>

    <p>Hello,</p>
    <p>Great news! Your registration for <strong>${name}</strong> has been <strong style="color:#16a34a;">APPROVED</strong> by the CodeArc Operations Team.</p>
    <p>Your account is now <strong>fully active</strong> and ready to use!</p>

    <div style="background:#f0fdf4;padding:16px;border-radius:8px;margin:20px 0;border-left:4px solid #22c55e;">
      <h3 style="margin-top:0;color:#0f172a;font-size:14px;">&#128273; Your Login Credentials:</h3>
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
      <li>&#128231; Email: <a href="mailto:hello@codearc.co.in" style="color:#22c55e;">hello@codearc.co.in</a></li>
      <li>&#128222; Call: +91 99837 21179</li>
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
      <h1 style="color:#1e40af;font-size:20px;margin:0;">&#128276; New Outlet Registration</h1>
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
