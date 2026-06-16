// Supabase Edge Function: notify-registration
// Deploy to: supabase/functions/notify-registration/index.ts
// Triggered by: Supabase Database Webhook on INSERT to public.saas_tenants
//
// This function sends registration & approval emails through an HTTPS relay.
// It runs in Supabase's cloud — completely independent of the WhatsApp gateway.
// Email continues to work when the WhatsApp gateway is down.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ADMIN_EMAIL = Deno.env.get("ADMIN_ALERT_EMAIL") || "";
const EMAIL_RELAY_URL = Deno.env.get("EMAIL_RELAY_URL") || "";
const EMAIL_RELAY_TOKEN = Deno.env.get("EMAIL_RELAY_TOKEN") || "";
const EMAIL_WEBHOOK_SECRET = Deno.env.get("EMAIL_WEBHOOK_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ZERO_COST_EMAILS_DISABLED = (Deno.env.get("ZERO_COST_EMAILS_DISABLED") || "false") === "true";

type DeliveryResult = {
  recipient: string;
  status: "sent" | "failed" | "skipped";
  reason?: string;
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  if (!EMAIL_WEBHOOK_SECRET) return false;
  const explicitSecret = req.headers.get("x-webhook-secret") || "";
  const authorization = req.headers.get("authorization") || "";
  return explicitSecret === EMAIL_WEBHOOK_SECRET || authorization === `Bearer ${EMAIL_WEBHOOK_SECRET}`;
}

async function logDelivery(event: string, status: "ok" | "error" | "warning", details: Record<string, unknown>) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/gateway_health_log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ event, status, details }),
    });
  } catch (error) {
    console.error("[Edge Email] Failed to write delivery log:", error);
  }
}

// Send email via Google Apps Script Web App Relay
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!to) throw new Error("Recipient email is missing.");
  if (ZERO_COST_EMAILS_DISABLED) throw new Error("Email delivery is disabled by ZERO_COST_EMAILS_DISABLED.");
  if (!EMAIL_RELAY_URL) throw new Error("EMAIL_RELAY_URL is not configured.");

  const response = await fetch(EMAIL_RELAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(EMAIL_RELAY_TOKEN ? { "Authorization": `Bearer ${EMAIL_RELAY_TOKEN}` } : {}),
    },
    body: JSON.stringify({ to, subject, html }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Relay request failed: ${response.status} - ${errText}`);
  }

  const resJson = await response.json().catch(() => ({}));
  if (!(resJson.status === "success" || resJson.status === "ok" || resJson.ok === true)) {
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

              <div style="font-size:24px; font-weight:700; color:#111827; margin-bottom:8px;">
                Registration Received
              </div>

              <div style="font-size:15px; color:#6b7280; line-height:24px;">
                We have successfully received your request to register on the CodeArc RestroSuite platform.
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
                Dear Customer,
              </div>

              <div style="font-size:15px; color:#374151; line-height:28px; margin-top:10px;">
                Thank you for submitting a registration request for your outlet, <strong>${name}</strong> (${displayType}), with <strong>CodeArc RestroSuite</strong>.
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
                Our operations team is currently reviewing your registration details.
                Once the review process is complete and your account is approved, you will receive a confirmation email and WhatsApp notification containing your login access credentials.
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
                Support and Inquiries:
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
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background: #ffffff;">
    <div style="border-bottom: 2px solid #22c55e; padding-bottom: 12px; margin-bottom: 20px; text-align: center;">
      <h2 style="color: #16a34a; margin: 0; font-size: 20px; font-weight: 700;">Account Approved & Active</h2>
      <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">CodeArc RestroSuite Platform</p>
    </div>

    <p style="font-size: 14px; line-height: 1.6;">Dear Partner,</p>
    <p style="font-size: 14px; line-height: 1.6;">We are pleased to inform you that your registration request for <strong>${name}</strong> has been reviewed and approved by the CodeArc Operations Team. Your account is now fully active and ready for configuration.</p>

    <div style="background: #f8fafc; padding: 16px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #22c55e;">
      <h3 style="margin-top: 0; color: #1e293b; font-size: 14px; font-weight: 600;">🔑 Access Credentials:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; width: 180px; color: #475569;">Outlet ID (Slug):</td><td style="color: #1e293b; font-family: monospace;">${slug}</td></tr>
        <tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px 0; font-weight: 600; color: #475569;">Admin Username:</td><td style="color: #1e293b; font-family: monospace;">${username}</td></tr>
      </table>
    </div>

    <p style="font-size: 14px; line-height: 1.6;">You can access your store management dashboard portal using the link below:</p>
    <div style="text-align: center; margin: 24px 0;">
      <a href="https://codearc-restrosuite.vercel.app/login" style="background: #22c55e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Access Login Portal</a>
    </div>

    <p style="font-size: 14px; line-height: 1.6;">Please log in to review your outlet configuration, tax parameters, menu settings, and employee rosters to commence operations.</p>

    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
    <p style="font-size: 13px; color: #475569; margin-bottom: 8px;">For any inquiries or onboarding support, please contact our department:</p>
    <ul style="font-size: 13px; color: #475569; padding-left: 20px; margin-top: 0; line-height: 1.6;">
      <li>Email: hello@codearc.co.in</li>
      <li>Phone: +91 99837 21179</li>
    </ul>
    <p style="font-size: 11px; color: #94a3b8; margin-top: 24px; text-align: center;">Welcome to the CodeArc RestroSuite platform.</p>
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
    <p>A new outlet has registered on the RestroSuite portal. Please review and approve it from the Super Admin dashboard.</p>

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
    <p style="font-size:11px;color:#999;text-align:center;">Automated notification from CodeArc RestroSuite.</p>
  </div>`;
}

serve(async (req: Request) => {
  // Allow only POST requests
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!authorized(req)) {
    return jsonResponse({ error: "Unauthorized webhook request" }, 401);
  }

  if (ZERO_COST_EMAILS_DISABLED) {
    return jsonResponse({ status: "disabled", error: "Email delivery is disabled." }, 503);
  }

  if (!EMAIL_RELAY_URL) {
    return jsonResponse({ status: "misconfigured", error: "EMAIL_RELAY_URL is not configured." }, 503);
  }

  let body: { type?: string; table?: string; record?: Record<string, string>; old_record?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { type, table, record, old_record } = body;

  if (!record || table !== "saas_tenants") {
    return jsonResponse({ status: "ignored", reason: "Not a saas_tenants event" });
  }

  const errors: string[] = [];
  const deliveries: DeliveryResult[] = [];

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
            `Registration Received – CodeArc RestroSuite (${record.name})`,
            buildRegistrationEmailHtml(record)
          );
          console.log(`[Edge Email] Registration confirmation sent to customer: ${customerEmail}`);
          deliveries.push({ recipient: customerEmail, status: "sent" });
          await logDelivery("registration_email_sent", "ok", {
            email: customerEmail,
            name: record.name,
            slug: record.slug,
          });
        } catch (err) {
          console.error(`[Edge Email Error] Customer email failed:`, err);
          errors.push(`customer_email: ${err}`);
          deliveries.push({ recipient: customerEmail, status: "failed", reason: String(err) });
          await logDelivery("registration_email_failed", "error", {
            email: customerEmail,
            name: record.name,
            slug: record.slug,
            error: String(err),
          });
        }
      } else {
        deliveries.push({ recipient: "customer", status: "skipped", reason: "No customer email supplied." });
      }

      // 2. Send admin notification
      if (adminEmail) {
        try {
          await sendEmail(
            adminEmail,
            `🔔 New Registration: ${record.name} (${record.slug})`,
            buildAdminNewRegistrationEmailHtml(record)
          );
          console.log(`[Edge Email] Admin notification sent to: ${adminEmail}`);
          deliveries.push({ recipient: adminEmail, status: "sent" });
          await logDelivery("registration_admin_email_sent", "ok", {
            email: adminEmail,
            name: record.name,
            slug: record.slug,
          });
        } catch (err) {
          console.error(`[Edge Email Error] Admin email failed:`, err);
          errors.push(`admin_email: ${err}`);
          deliveries.push({ recipient: adminEmail, status: "failed", reason: String(err) });
          await logDelivery("registration_admin_email_failed", "error", {
            email: adminEmail,
            name: record.name,
            slug: record.slug,
            error: String(err),
          });
        }
      } else {
        deliveries.push({ recipient: "admin", status: "skipped", reason: "ADMIN_ALERT_EMAIL is not configured." });
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
              `✅ Account Approved & Active – CodeArc RestroSuite (${record.name})`,
              buildApprovalEmailHtml(record)
            );
            console.log(`[Edge Email] Approval email sent to: ${customerEmail}`);
            deliveries.push({ recipient: customerEmail, status: "sent" });
            await logDelivery("approval_email_sent", "ok", {
              email: customerEmail,
              name: record.name,
              slug: record.slug,
            });
          } catch (err) {
            console.error(`[Edge Email Error] Approval email failed:`, err);
            errors.push(`approval_email: ${err}`);
            deliveries.push({ recipient: customerEmail, status: "failed", reason: String(err) });
            await logDelivery("approval_email_failed", "error", {
              email: customerEmail,
              name: record.name,
              slug: record.slug,
              error: String(err),
            });
          }
        } else {
          deliveries.push({ recipient: "customer", status: "skipped", reason: "No customer email supplied." });
        }
      }
    }
  } catch (err) {
    console.error("[Edge Function] Unexpected error:", err);
    return jsonResponse({ status: "error", error: String(err) }, 500);
  }

  return jsonResponse({
    status: errors.length === 0 ? "success" : "partial",
    deliveries,
    errors: errors.length > 0 ? errors : undefined,
  }, errors.length === 0 ? 200 : 207);
});
