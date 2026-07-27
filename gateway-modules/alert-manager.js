'use strict';
/**
 * gateway-modules/alert-manager.js
 * ─────────────────────────────────
 * Multi-channel admin alert system: email (SMTP / HTTP relay), Telegram bot,
 * and OS desktop notification. Every channel is independently optional — a
 * missing token or failed delivery never blocks the others.
 *
 * Exported: createAlertManager(ctx) → { sendAdminAlert }
 *
 * ctx shape: {
 *   logHealthEvent,           // from health-logger
 *   emailConfig,              // { user, pass, fromName, relayUrl }
 *   transporter,              // nodemailer transport or null
 * }
 *
 * Reads directly from process.env for alert-specific config so that the
 * module is self-contained and testable without a full gateway boot.
 */

const ADMIN_ALERT_EMAIL     = process.env.ADMIN_ALERT_EMAIL     || 'csheoganj@gmail.com';
const TELEGRAM_BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN    || '';
const TELEGRAM_CHAT_ID      = process.env.TELEGRAM_CHAT_ID      || '';
const DESKTOP_ALERTS_ENABLED = String(process.env.DESKTOP_ALERTS_ENABLED || 'true').toLowerCase() === 'true';

// Throttle: at most one alert per type per 10 minutes.
const _lastAlertSentByType = new Map();

// ── Telegram ────────────────────────────────────────────────────────────────
async function sendTelegramAlert(text) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return { skipped: true, reason: 'not configured' };
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Telegram API ${res.status}: ${body.slice(0, 200)}`);
    }
    return { skipped: false };
}

// ── Desktop (node-notifier — optional dep) ───────────────────────────────────
let _notifier = null;
let _notifierLoadFailed = false;

function getNotifier() {
    if (_notifier || _notifierLoadFailed) { return _notifier; }
    try {
        _notifier = require('node-notifier');
    } catch (_) {
        _notifierLoadFailed = true;
        console.warn('[Desktop Alert] node-notifier not installed — run `npm install`. Skipping desktop popups.');
    }
    return _notifier;
}

async function sendDesktopAlert(title, message) {
    if (!DESKTOP_ALERTS_ENABLED) { return { skipped: true, reason: 'disabled' }; }
    const notifier = getNotifier();
    if (!notifier) { return { skipped: true, reason: 'node-notifier not installed' }; }
    return new Promise((resolve, reject) => {
        notifier.notify({ title, message, sound: true, wait: false, timeout: 20 }, (err) => {
            if (err) { reject(err); } else { resolve({ skipped: false }); }
        });
    });
}

// ── Fan-out helper ───────────────────────────────────────────────────────────
async function fanOutExtraAlerts(type, subject, plainText) {
    const jobs = [
        { name: 'telegram', run: () => sendTelegramAlert(`<b>${subject}</b>\n${plainText}`) },
        { name: 'desktop',  run: () => sendDesktopAlert(subject, plainText) },
    ];
    const results = await Promise.allSettled(jobs.map((j) => j.run()));
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            if (!result.value || !result.value.skipped) {
                console.log(`[Admin Alert] ${jobs[i].name} alert sent: ${subject}`);
            }
        } else {
            console.error(`[Admin Alert Error] ${jobs[i].name} failed:`, result.reason && result.reason.message);
        }
    });
}

// ── Email helper (called via ctx.sendMailHelper so no circular dep) ───────────
// The sendMailHelper is injected via ctx because it depends on the transporter
// which is constructed in the main gateway file where nodemailer lives.

// ── HTML email templates ─────────────────────────────────────────────────────
function buildEmailPayload(type, extraDetails, timeStr) {
    const dashboardUrl = process.env.PUBLIC_DASHBOARD_URL || process.env.WHATSAPP_GATEWAY_URL || 'https://restrosuite.codearc.co.in';
    let subject = '';
    let bodyHtml = '';

    if (type === 'disconnected') {
        subject = '[Alert] RestroSuite WhatsApp Gateway Offline';
        bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;color:#1e293b;background:#ffffff;">
          <div style="border-bottom:2px solid #ef4444;padding-bottom:12px;margin-bottom:20px;">
            <h2 style="color:#dc2626;margin:0;font-size:20px;font-weight:700;">System Alert: WhatsApp Gateway Offline</h2>
            <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Automated health monitor report</p>
          </div>
          <p style="font-size:14px;line-height:1.6;">The RestroSuite WhatsApp notification gateway has disconnected.</p>
          <table style="font-size:13px;width:100%;margin:20px 0;border-collapse:collapse;">
            <tr style="border-bottom:1px solid #f1f5f9;"><td style="font-weight:600;width:180px;padding:8px 0;color:#475569;">Status:</td><td style="color:#dc2626;font-weight:600;padding:8px 0;">OFFLINE</td></tr>
            <tr style="border-bottom:1px solid #f1f5f9;"><td style="font-weight:600;padding:8px 0;color:#475569;">Time:</td><td style="padding:8px 0;color:#334155;">${timeStr}</td></tr>
            <tr style="border-bottom:1px solid #f1f5f9;"><td style="font-weight:600;padding:8px 0;color:#475569;">Attempts:</td><td style="padding:8px 0;color:#334155;">${extraDetails.attempts || 0} (auto-retry)</td></tr>
            <tr><td style="font-weight:600;padding:8px 0;color:#475569;">Reason:</td><td style="padding:8px 0;color:#334155;font-family:monospace;">${extraDetails.reason || 'Unknown'}</td></tr>
          </table>
          <a href="${dashboardUrl}" style="background:#0284c7;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Open Dashboard →</a>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0 16px;">
          <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">CodeArc RestroSuite Gateway Monitor</p>
        </div>`;
    } else if (type === 'online') {
        subject = '[Resolved] RestroSuite WhatsApp Gateway Back Online';
        bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;color:#1e293b;background:#ffffff;">
          <div style="border-bottom:2px solid #22c55e;padding-bottom:12px;margin-bottom:20px;">
            <h2 style="color:#16a34a;margin:0;font-size:20px;font-weight:700;">System Restored: WhatsApp Gateway Online</h2>
          </div>
          <table style="font-size:13px;width:100%;margin:20px 0;border-collapse:collapse;">
            <tr style="border-bottom:1px solid #f1f5f9;"><td style="font-weight:600;width:180px;padding:8px 0;color:#475569;">Status:</td><td style="color:#16a34a;font-weight:600;padding:8px 0;">ONLINE / READY</td></tr>
            <tr style="border-bottom:1px solid #f1f5f9;"><td style="font-weight:600;padding:8px 0;color:#475569;">Time:</td><td style="padding:8px 0;color:#334155;">${timeStr}</td></tr>
            <tr><td style="font-weight:600;padding:8px 0;color:#475569;">Number:</td><td style="padding:8px 0;color:#334155;font-family:monospace;">+${extraDetails.number || 'Unknown'}</td></tr>
          </table>
          <p style="font-size:14px;color:#16a34a;font-weight:600;">All dispatches resumed. No action required.</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0 16px;">
          <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">CodeArc RestroSuite Gateway Monitor</p>
        </div>`;
    } else if (type === 'qr_needed') {
        subject = '[Action Required] WhatsApp Device Link Required';
        bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;color:#1e293b;background:#ffffff;">
          <div style="border-bottom:2px solid #eab308;padding-bottom:12px;margin-bottom:20px;">
            <h2 style="color:#ca8a04;margin:0;font-size:20px;font-weight:700;">Action Required: QR Scan Needed</h2>
          </div>
          <p style="font-size:14px;">The gateway cannot restore the cached session. Scan the QR at <a href="${dashboardUrl}">${dashboardUrl}</a>.</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0 16px;">
          <p style="font-size:11px;color:#94a3b8;text-align:center;margin:0;">CodeArc RestroSuite Gateway Monitor</p>
        </div>`;
    } else if (type === 'startup') {
        subject = '[System] RestroSuite WhatsApp Gateway Initialized';
        bodyHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;">
          <h2 style="margin:0 0 16px;">Gateway Started</h2>
          <p>Time: ${timeStr}<br>Session restored: ${extraDetails.sessionRestored ? 'Yes' : 'No (QR scan needed)'}</p>
        </div>`;
    }

    return subject ? { subject, bodyHtml } : null;
}

// ── Public factory ───────────────────────────────────────────────────────────
function createAlertManager(ctx) {
    /**
     * Send an admin alert across all configured channels (email + Telegram + desktop).
     * Throttled to once per type per 10 minutes.
     *
     * @param {'disconnected'|'online'|'qr_needed'|'startup'} type
     * @param {object} [extraDetails]
     */
    async function sendAdminAlert(type, extraDetails = {}) {
        const emailConfigured = !!(ctx.transporter || (ctx.emailConfig && ctx.emailConfig.relayUrl));
        if (!emailConfigured && !TELEGRAM_BOT_TOKEN && !DESKTOP_ALERTS_ENABLED) {
            console.warn('[Admin Alert] No alert channel configured. Alert not sent.');
            return;
        }

        // Throttle
        const now = Date.now();
        const lastSent = _lastAlertSentByType.get(type) || 0;
        if ((now - lastSent) < 10 * 60 * 1000) {
            console.log(`[Admin Alert] Throttled — ${type} sent recently.`);
            return;
        }
        _lastAlertSentByType.set(type, now);

        const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
        const payload = buildEmailPayload(type, extraDetails, timeStr);
        if (!payload) { return; }

        const plainTextMap = {
            disconnected: `WhatsApp gateway OFFLINE at ${timeStr}. Reason: ${extraDetails.reason || 'Unknown'}. Attempts: ${extraDetails.attempts || 0}.`,
            online:       `WhatsApp gateway ONLINE at ${timeStr} (+${extraDetails.number || 'unknown'}).`,
            qr_needed:    `QR scan needed at ${timeStr}. ${extraDetails.reason || ''}`.trim(),
            startup:      `Gateway started at ${timeStr}.`,
        };
        const plainText = plainTextMap[type] || payload.subject;

        const emailJob = emailConfigured
            ? ctx.sendMailHelper(ADMIN_ALERT_EMAIL, payload.subject, payload.bodyHtml)
                .then(() => console.log(`[Admin Alert] Email sent: ${payload.subject}`))
                .catch((err) => console.error('[Admin Alert] Email failed:', err.message))
            : Promise.resolve();

        await Promise.allSettled([
            emailJob,
            fanOutExtraAlerts(type, payload.subject, plainText),
        ]);

        if (ctx.logHealthEvent) {
            await ctx.logHealthEvent('alert_sent', 'ok', {
                type,
                to: ADMIN_ALERT_EMAIL,
                channels: { email: emailConfigured, telegram: !!TELEGRAM_BOT_TOKEN, desktop: DESKTOP_ALERTS_ENABLED },
            });
        }
    }

    return { sendAdminAlert };
}

module.exports = { createAlertManager };
