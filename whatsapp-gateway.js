require('dns').setDefaultResultOrder('ipv4first');
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCodeLib = require('qrcode');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const archiver = require('archiver');
const unzipper = require('unzipper');

// ============================================================
// SUPABASE CLIENTS
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[Config] SUPABASE_URL or SUPABASE_ANON_KEY is not set. Supabase-dependent features (realtime, health log) will be disabled.');
}

// Service-role key for Supabase Storage access (set as env variable in HuggingFace Secrets)
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Anon client for Realtime
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { transport: ws }
});

// Service client for Storage (session backup) + health log
const hasServiceKey = SUPABASE_SERVICE_KEY &&
                      SUPABASE_SERVICE_KEY.trim() !== '' &&
                      !SUPABASE_SERVICE_KEY.startsWith('<');
const supabaseService = hasServiceKey
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { realtime: { transport: ws } })
    : null;

// Storage bucket name for WhatsApp session backup
const SESSION_BUCKET = 'whatsapp-session';
const SESSION_FILE_NAME = 'session.zip';

// ============================================================
// ADMIN ALERT CONFIGURATION
// ============================================================
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || 'csheoganj@gmail.com';
const ADMIN_ALERT_WHATSAPP = process.env.ADMIN_ALERT_WHATSAPP || '919983721179'; // +91 99837 21179

// Configure Nodemailer for Free Gmail SMTP sending (Made by Antigravity)
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

let emailConfig = {
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || '',
    fromName: process.env.FROM_NAME || 'CodeArc RestroSuite',
    relayUrl: process.env.EMAIL_RELAY_URL || ''
};
const REGISTRATION_EMAILS_ENABLED = String(process.env.REGISTRATION_EMAILS_ENABLED || 'false').toLowerCase() === 'true';

const configPath = path.join(__dirname, 'email-config.json');
if (fs.existsSync(configPath)) {
    try {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!emailConfig.user) {
            emailConfig.user = fileConfig.gmail_user || '';
            emailConfig.pass = fileConfig.gmail_app_password || '';
        }
        emailConfig.fromName = fileConfig.from_name || emailConfig.fromName;
        emailConfig.relayUrl = fileConfig.email_relay_url || emailConfig.relayUrl;
    } catch (err) {
        console.error("Failed to parse local email-config.json:", err.message);
    }
}

let transporter = null;
const dns = require('dns');
if (emailConfig.user && emailConfig.pass) {
    transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        family: 4, // Force IPv4 — Hugging Face Spaces block IPv6 outbound connections
        lookup: (hostname, options, callback) => {
            return dns.lookup(hostname, { family: 4 }, callback);
        },
        auth: {
            user: emailConfig.user,
            pass: emailConfig.pass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    });
    console.log(`[SMTP] Nodemailer configured to send as: ${emailConfig.user}`);
} else if (!emailConfig.relayUrl) {
    console.log('[SMTP Warning] GMAIL_USER and GMAIL_APP_PASSWORD not set. Email notifications will be disabled unless EMAIL_RELAY_URL is provided.');
}

if (emailConfig.relayUrl) {
    console.log(`[Email Relay] Configured to send emails via HTTP Relay: ${emailConfig.relayUrl}`);
}

async function sendMailHelper(to, subject, html, text = '') {
    if (emailConfig.relayUrl) {
        // Send via HTTPS Relay Web App using native fetch (automatically follows redirects)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
            const response = await fetch(emailConfig.relayUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ to, subject, html, text }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const responseText = await response.text();
            let parsed = null;
            try {
                parsed = JSON.parse(responseText);
            } catch (_) {
                // Not JSON response
            }
            
            if (parsed && (parsed.status === 'success' || parsed.ok || parsed.status === 'ok')) {
                return { messageId: parsed.messageId || 'relay_ok' };
            } else if (response.ok || (response.status >= 200 && response.status < 300)) {
                return { messageId: 'relay_ok' };
            } else {
                const errorMsg = parsed?.error || responseText || `Status ${response.status}`;
                throw new Error(errorMsg);
            }
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('Relay connection timeout');
            }
            throw err;
        }
    } else if (transporter) {
        // Send via SMTP
        return transporter.sendMail({
            from: `"${emailConfig.fromName}" <${emailConfig.user}>`,
            to,
            subject,
            text,
            html
        });
    } else {
        throw new Error('No email service configured (SMTP or Relay).');
    }
}

const app = express();

// SECURITY: CORS must be restricted — wildcard cors() allows any origin to make
// credentialed requests to the gateway, which is a CSRF vector. Restrict to the
// Supabase Edge Function origin and your Vercel deployment origin.
// GATEWAY_ALLOWED_ORIGINS must be set in environment secrets. If unset, ALL
// cross-origin requests are blocked (fail-closed). Example:
//   GATEWAY_ALLOWED_ORIGINS=https://codearc-restrosuite.vercel.app,https://htkauiibuejetimfiavs.supabase.co
const GATEWAY_ALLOWED_ORIGINS_RAW = (process.env.GATEWAY_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (GATEWAY_ALLOWED_ORIGINS_RAW.length === 0) {
    console.warn('[Security] GATEWAY_ALLOWED_ORIGINS is not set. All cross-origin requests will be blocked. Set it in environment secrets.');
}
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (server-to-server, curl, Postman in same-origin context)
        if (!origin) return callback(null, true);
        // Fail-closed: if no origins are configured, block all cross-origin requests
        if (GATEWAY_ALLOWED_ORIGINS_RAW.length === 0) {
            return callback(new Error('CORS: no allowed origins configured'));
        }
        if (GATEWAY_ALLOWED_ORIGINS_RAW.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
}));
app.use(express.json());

// Multi-Tenant Gateway State Manager
const tenantClients = new Map(); // tenantId -> TenantClientData
// Orders already handled by the /send endpoint — realtime listener skips these
// to prevent double-sending when the POS frontend sends explicitly (e.g. PDF mode).
const realtimeSkipOrders = new Set(); // "tenantId:orderId"
const MAX_RECONNECT_ATTEMPTS = 5;
let totalMessagesSent = 0;
let recentHealthEvents = []; // last 10 events for dashboard
let lastAlertSent = null;

// ============================================================
// HEALTH LOGGING — writes to gateway_health_log in Supabase
// ============================================================
async function logHealthEvent(event, status, details = {}) {
    const entry = { event, status, details, created_at: new Date().toISOString() };
    // Keep last 200 events in memory for dashboard filtering
    recentHealthEvents.unshift(entry);
    if (recentHealthEvents.length > 200) recentHealthEvents.pop();

    if (!supabaseService) {
        console.log(`[Health Log] (no service key) ${event} - ${status}`);
        return;
    }
    try {
        await supabaseService.from('gateway_health_log').insert({ event, status, details });
    } catch (err) {
        console.error('[Health Log Error]', err.message);
    }
}

// ============================================================
// ADMIN ALERT — sends email to admin when gateway is in trouble
// ============================================================
async function sendAdminAlert(type, extraDetails = {}) {
    if (!transporter) {
        console.warn('[Admin Alert] Email transporter not configured. Alert not sent.');
        return;
    }

    // Throttle alerts — don't spam more than once per 10 minutes for same type
    const now = Date.now();
    if (lastAlertSent && lastAlertSent.type === type && (now - lastAlertSent.time) < 10 * 60 * 1000) {
        console.log(`[Admin Alert] Throttled — ${type} alert already sent recently.`);
        return;
    }
    lastAlertSent = { type, time: now };

    const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    let subject = '';
    let bodyHtml = '';
    const dashboardUrl = 'https://kalpeshdeora1006-whatsapp-gateway.hf.space';

    if (type === 'disconnected') {
        subject = '[Alert] RestroSuite WhatsApp Gateway Offline';
        bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background: #ffffff;">
          <div style="border-bottom: 2px solid #ef4444; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #dc2626; margin: 0; font-size: 20px; font-weight: 700;">System Alert: WhatsApp Gateway Offline</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Automated health monitor report</p>
          </div>
          <p style="font-size: 14px; line-height: 1.6;">Please be advised that the RestroSuite WhatsApp notification gateway has disconnected. System operations are currently affected.</p>
          
          <table style="font-size: 13px; width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; width: 180px; padding: 8px 0; color: #475569;">Connection Status:</td><td style="color: #dc2626; font-weight: 600; padding: 8px 0;">OFFLINE</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 8px 0; color: #475569;">Timestamp:</td><td style="padding: 8px 0; color: #334155;">${timeStr}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 8px 0; color: #475569;">Reconnect Attempts:</td><td style="padding: 8px 0; color: #334155;">${extraDetails.attempts || 0}/${MAX_RECONNECT_ATTEMPTS}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 8px 0; color: #475569;">Reported Reason:</td><td style="padding: 8px 0; color: #334155; font-family: monospace;">${extraDetails.reason || 'Unknown'}</td></tr>
          </table>

          <div style="background: #f8fafc; border-left: 4px solid #ef4444; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px; font-weight: 600;">System Impact</h4>
            <ul style="font-size: 13px; margin: 0; padding-left: 20px; color: #475569; line-height: 1.6;">
              <li>New customer/outlet registration confirmations are suspended.</li>
              <li>Automated billing receipts dispatch via WhatsApp is paused.</li>
              <li>Email relays continue to operate normally.</li>
            </ul>
          </div>

          <div style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
            <h4 style="margin: 0 0 8px 0; color: #0369a1; font-size: 14px; font-weight: 600;">Recommended Action</h4>
            <ol style="font-size: 13px; margin: 0; padding-left: 20px; color: #0369a1; line-height: 1.6;">
              <li>Access the system console at <a href="${dashboardUrl}" style="color: #0284c7; text-decoration: underline;">${dashboardUrl}</a></li>
              <li>Verify the connection state; if a linking QR is displayed, perform a fresh scan.</li>
              <li>If the service fails to reconnect, perform a gateway reset from the console.</li>
            </ol>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 16px;">
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">This is an automated system message from the CodeArc RestroSuite Gateway Monitor.</p>
        </div>`;
    } else if (type === 'online') {
        subject = '[Resolved] RestroSuite WhatsApp Gateway Back Online';
        bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background: #ffffff;">
          <div style="border-bottom: 2px solid #22c55e; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #16a34a; margin: 0; font-size: 20px; font-weight: 700;">System Restored: WhatsApp Gateway Online</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Automated health monitor report</p>
          </div>
          <p style="font-size: 14px; line-height: 1.6;">This email is to confirm that the RestroSuite WhatsApp notification gateway has successfully re-established a connection and is now fully operational.</p>
          
          <table style="font-size: 13px; width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; width: 180px; padding: 8px 0; color: #475569;">Connection Status:</td><td style="color: #16a34a; font-weight: 600; padding: 8px 0;">ONLINE / READY</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 8px 0; color: #475569;">Timestamp:</td><td style="padding: 8px 0; color: #334155;">${timeStr}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 8px 0; color: #475569;">Connected Line:</td><td style="padding: 8px 0; color: #334155; font-family: monospace;">+${extraDetails.number || (tenantClients.get('system')?.number) || 'Unknown'}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 8px 0; color: #475569;">Cloud Session Backup:</td><td style="padding: 8px 0; color: #334155;">${extraDetails.sessionSaved ? 'Verified and Saved' : 'Pending'}</td></tr>
          </table>

          <p style="font-size: 14px; color: #16a34a; font-weight: 600; margin-bottom: 24px;">All automated dispatches, registrations, and billing receipts have resumed. No further action is required.</p>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 16px;">
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">This is an automated system message from the CodeArc RestroSuite Gateway Monitor.</p>
        </div>`;
    } else if (type === 'qr_needed') {
        subject = '[Action Required] WhatsApp Device Link Required';
        bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background: #ffffff;">
          <div style="border-bottom: 2px solid #eab308; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #ca8a04; margin: 0; font-size: 20px; font-weight: 700;">Action Required: Device Link Required</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">Authentication session expired</p>
          </div>
          <p style="font-size: 14px; line-height: 1.6;">The WhatsApp gateway was unable to restore the cached session credentials. Manual authentication is required to re-establish the connection.</p>
          
          <div style="background: #fef9c3; border-left: 4px solid #eab308; padding: 16px; border-radius: 6px; margin: 20px 0; color: #713f12;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Authentication Steps:</h4>
            <ol style="font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.6;">
              <li>Open the admin console at <a href="${dashboardUrl}" style="color: #ca8a04; text-decoration: underline;">${dashboardUrl}</a></li>
              <li>Wait for the gateway to render the authentication QR code.</li>
              <li>Open <strong>WhatsApp</strong> on your dedicated system device.</li>
              <li>Navigate to <strong>Linked Devices &gt; Link a Device</strong> and scan the displayed QR code.</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 24px 0;">
            <a href="${dashboardUrl}" style="background: #ca8a04; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Open Console Dashboard</a>
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 16px;">
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">This is an automated system message from the CodeArc RestroSuite Gateway Monitor.</p>
        </div>`;
    } else if (type === 'startup') {
        subject = '[System] RestroSuite WhatsApp Gateway Initialized';
        bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background: #ffffff;">
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700;">System Notice: Gateway Server Started</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0;">System initialization report</p>
          </div>
          <p style="font-size: 14px; line-height: 1.6;">This is an automated notification confirming that the WhatsApp gateway server has successfully initialized.</p>
          
          <table style="font-size: 13px; width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; width: 180px; padding: 8px 0; color: #475569;">Startup Timestamp:</td><td style="padding: 8px 0; color: #334155;">${timeStr}</td></tr>
            <tr style="border-bottom: 1px solid #f1f5f9;"><td style="font-weight: 600; padding: 8px 0; color: #475569;">Session Restoration:</td><td style="padding: 8px 0; color: #334155;">${extraDetails.sessionRestored ? 'Success (Auto-reconnecting)' : 'Failed (QR scan required)'}</td></tr>
          </table>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 16px;">
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">This is an automated system message from the CodeArc RestroSuite Gateway Monitor.</p>
        </div>`;
    }

    if (!subject) return;

    try {
        await sendMailHelper(ADMIN_ALERT_EMAIL, subject, bodyHtml);
        console.log(`[Admin Alert] Email sent: ${subject}`);
        await logHealthEvent('alert_sent', 'ok', { type, to: ADMIN_ALERT_EMAIL });
    } catch (err) {
        console.error(`[Admin Alert Error] Failed to send alert email:`, err.message);
    }
}

// ============================================================
// SESSION PERSISTENCE — Save/Restore WhatsApp session via Supabase Storage
// ============================================================
async function saveSessionToSupabaseScoped(tenantId) {
    if (!supabaseService) {
        console.warn(`[Session Save] SUPABASE_SERVICE_KEY not set. Session backup skipped for tenant: ${tenantId}`);
        return;
    }
    const tenantFolder = path.join(authDataPath, `session-${tenantId}`);
    if (!fs.existsSync(tenantFolder)) {
        console.warn(`[Session Save] Auth data path does not exist for tenant ${tenantId}. Nothing to save.`);
        return;
    }
    const zipPath = path.join(os.tmpdir(), `wa_session_backup_${tenantId}.zip`);
    const fileName = `session-${tenantId}.zip`;
    try {
        // Zip the auth folder excluding Chrome cache files to keep size under 3MB and avoid corruption
        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.glob('**/*', {
                cwd: tenantFolder,
                ignore: [
                    '**/Cache/**',
                    '**/Code Cache/**',
                    '**/GPUCache/**',
                    '**/Service Worker/**',
                    '**/Crashpad/**',
                    '**/*.pma',
                    '**/LOCK',
                    '**/SingletonLock',
                    '**/SingletonCookie',
                    '**/SingletonSocket',
                    '**/*LOCK*',
                    '**/*lock*',
                    '**/*singleton*',
                    '**/*Singleton*',
                    '**/LOG',
                    '**/LOG.old',
                    // Ignore all extra Chrome cache/download/telemetry folders to keep session zip small
                    '**/*cache**',
                    '**/*Cache**',
                    '**/blob_storage/**',
                    '**/chrome_cart_db/**',
                    '**/commerce_subscription_db/**',
                    '**/discount_infos_db/**',
                    '**/discounts_db/**',
                    '**/parcel_tracking_db/**',
                    '**/shared_proto_db/**',
                    '**/Feature Engagement Tracker/**',
                    '**/AutofillStrikeDatabase/**',
                    '**/BudgetDatabase/**',
                    '**/Safe Browsing/**',
                    '**/SafeBrowsing/**',
                    '**/CertificateRevocation/**',
                    '**/component_crx_cache/**',
                    '**/extensions_crx_cache/**',
                    '**/TranslateKit/**',
                    '**/ActorSafetyLists/**',
                    '**/AmountExtractionHeuristicRegexes/**',
                    '**/FileTypePolicies/**',
                    '**/ZxcvbnData/**',
                    '**/*.log',
                    '**/*.txt',
                    // Extra optimization: exclude heavy IndexedDB blobs, network sessions, extensions and storage logs
                    '**/*.blob',
                    '**/*.blob/**',
                    '**/IndexedDB/**/*.blob/**',
                    '**/Network/**',
                    '**/databases/**',
                    '**/Session Storage/**',
                    '**/Extension State/**',
                    '**/Local Extension Settings/**',
                    '**/Sync Data/**'
                ]
            });
            
            archive.finalize();
        });

        const zipBuffer = fs.readFileSync(zipPath);
        const { error } = await supabaseService.storage
            .from(SESSION_BUCKET)
            .upload(fileName, zipBuffer, {
                contentType: 'application/zip',
                upsert: true
            });

        if (error) throw error;

        console.log(`[Session Save] ✅ Tenant ${tenantId} WhatsApp session backed up to Supabase Storage.`);
        await logHealthEvent('session_saved', 'ok', { path: fileName, size: zipBuffer.length });
    } catch (err) {
        console.error(`[Session Save Error] Tenant ${tenantId}:`, err.message);
        const size = fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0;
        const sizeMb = (size / (1024 * 1024)).toFixed(2) + ' MB';
        await logHealthEvent('session_save_failed', 'error', { error: err.message, zipSize: sizeMb });
    } finally {
        try { fs.unlinkSync(zipPath); } catch (_) {}
    }
}

function cleanupStaleLockFiles(dir) {
    if (!fs.existsSync(dir)) return;
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            let stat;
            try {
                stat = fs.lstatSync(fullPath);
            } catch (e) {
                // Skip files we cannot lstat (e.g. permission issues or deleted dynamically)
                continue;
            }
            if (stat.isDirectory()) {
                cleanupStaleLockFiles(fullPath);
            } else {
                const lowerItem = item.toLowerCase();
                const isLockFile = item === 'LOCK' ||
                                   lowerItem.includes('lock') ||
                                   lowerItem.includes('singleton');
                if (isLockFile) {
                    try {
                        fs.unlinkSync(fullPath);
                        console.log(`[Session Cleanup] Removed stale browser lock/socket/cookie file: ${fullPath}`);
                    } catch (e) {
                        console.warn(`[Session Cleanup Warning] Could not delete file ${fullPath}: ${e.message}`);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[Session Cleanup Error]', err.message);
    }
}

async function restoreSessionsFromSupabase() {
    if (!supabaseService) {
        console.warn('[Session Restore] SUPABASE_SERVICE_KEY not set. Skipping remote restore.');
        return;
    }
    try {
        console.log('[Session Restore] Scanning Supabase Storage for saved sessions...');
        const { data: files, error } = await supabaseService.storage
            .from(SESSION_BUCKET)
            .list();

        if (error || !files) {
            console.log('[Session Restore] No sessions found or failed to list.');
            return;
        }

        for (const file of files) {
            if (file.name.startsWith('session-') && file.name.endsWith('.zip')) {
                const tenantId = file.name.substring(8, file.name.length - 4);
                console.log(`[Session Restore] Found session zip for tenant: ${tenantId}. Downloading...`);
                
                const zipPath = path.join(os.tmpdir(), `wa_session_restore_${tenantId}.zip`);
                try {
                    const { data, error: dlError } = await supabaseService.storage
                        .from(SESSION_BUCKET)
                        .download(file.name);

                    if (dlError || !data) throw dlError || new Error('No data downloaded');

                    const arrayBuffer = await data.arrayBuffer();
                    fs.writeFileSync(zipPath, Buffer.from(arrayBuffer));

                    const tenantFolder = path.join(authDataPath, `session-${tenantId}`);
                    if (fs.existsSync(tenantFolder)) {
                        fs.rmSync(tenantFolder, { recursive: true, force: true });
                    }
                    fs.mkdirSync(tenantFolder, { recursive: true });

                    await fs.createReadStream(zipPath)
                        .pipe(unzipper.Extract({ path: tenantFolder }))
                        .promise();

                    cleanupStaleLockFiles(tenantFolder);
                    console.log(`[Session Restore] ✅ Tenant ${tenantId} session restored from Supabase.`);
                } catch(e) {
                    console.error(`[Session Restore Error] Failed to restore tenant ${tenantId}:`, e.message);
                } finally {
                    try { fs.unlinkSync(zipPath); } catch (_) {}
                }
            }
        }
    } catch (err) {
        console.error('[Session Restore Error]', err.message);
    }
}

function autoInitializeLocalSessions() {
    if (!fs.existsSync(authDataPath)) return;
    try {
        const files = fs.readdirSync(authDataPath);
        for (const file of files) {
            if (file.startsWith('session-')) {
                const tenantId = file.substring(8);
                if (tenantId) {
                    console.log(`[Startup Auto-Restore] Found local session directory for tenant: ${tenantId}`);
                    getOrCreateClient(tenantId);
                }
            }
        }
    } catch(err) {
        console.error('[Startup Auto-Restore Error] Failed to scan local sessions:', err.message);
    }
}

// SECURITY: GATEWAY_TOKEN must be explicitly set in production. There is NO
// default fallback — using a predictable default string is equivalent to
// publishing the token in source code. The gateway will refuse all authenticated
// requests if this variable is unset. Set it in your HuggingFace Space / Railway /
// VPS environment secrets, or in .env.local for local development.
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || process.env.GATEWAY_AUTH_TOKEN || process.env.WHATSAPP_GATEWAY_TOKEN || '';

// Constant-time string comparison for token verification. Prevents timing
// side-channel attacks where an attacker can infer the correct token byte-by-byte
// by measuring response times. Always compares the full length.
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    let diff = 0;
    for (let i = 0; i < aBuf.length; i++) diff |= aBuf[i] ^ bBuf[i];
    return diff === 0;
}

// Utility to mask phone numbers in logs to prevent customer data leaks
function maskPhone(phoneStr) {
    if (!phoneStr) return null;
    const clean = phoneStr.replace(/\D/g, '');
    if (clean.length <= 4) return '****';
    return clean.substring(0, 2) + '*'.repeat(clean.length - 6) + clean.substring(clean.length - 4);
}

// Token validation helper — FAIL-CLOSED.
// Returns true ONLY if a token is provided AND it matches the configured secret
// using constant-time comparison. If GATEWAY_TOKEN is empty, ALL requests are denied.
function verifyToken(req) {
    if (!GATEWAY_TOKEN) {
        console.warn('[Security] GATEWAY_TOKEN is not set. All authenticated endpoints are blocked. Set GATEWAY_TOKEN in environment secrets.');
        return false;
    }
    
    const authHeader = req.headers['authorization'];
    const xToken = req.headers['x-gateway-token'];
    const qToken = req.query ? req.query.token : null;
    let token = xToken || qToken;
    
    if (!token && authHeader) {
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else {
            token = authHeader;
        }
    }
    
    if (!token) return false;
    return timingSafeEqual(token, GATEWAY_TOKEN);
}

const os = require('os');

// Determine data path dynamically to support both Windows local execution and Linux cloud containers
let authDataPath = process.env.AUTH_DATA_PATH || path.join(__dirname, '.wwebjs_auth');
if (!process.env.AUTH_DATA_PATH && os.platform() === 'win32') {
    authDataPath = path.join(os.homedir(), '.restrosuite', 'whatsapp-auth');
}

// Initialize WhatsApp client with local session caching
// Multi-Tenant Client Factory
function getOrCreateClient(tenantId) {
    const tid = (tenantId && String(tenantId).trim()) ? String(tenantId).trim() : 'system';
    
    if (tenantClients.has(tid)) {
        return tenantClients.get(tid);
    }

    console.log(`[Multi-Tenant] Initializing client instance for tenant: ${tid}`);

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: tid,
            dataPath: authDataPath
        }),
        puppeteer: {
            handleSIGINT: false,
            protocolTimeout: 0,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-cache',
                '--disk-cache-size=0',
                '--media-cache-size=0',
                '--aggressive-cache-discard',
                '--disable-async-dns',
                '--disable-extensions',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            ]
        }
    });

    const tenantData = {
        client,
        status: 'connecting',
        qr: null,
        number: null,
        sessionSavedAt: null,
        reconnectAttempts: 0,
        watchdogTimer: null
    };

    const startWatchdog = () => {
        if (tenantData.watchdogTimer) clearTimeout(tenantData.watchdogTimer);
        tenantData.watchdogTimer = setTimeout(async () => {
            if (tenantData.status === 'connecting') {
                console.warn(`[Watchdog] Tenant ${tid} initialization timed out. Re-initializing...`);
                clearWatchdog();
                if (tenantClients.get(tid) === tenantData) {
                    tenantClients.delete(tid);
                }
                try { await client.destroy(); } catch (_) {}
                // Trigger a fresh client instantiation
                getOrCreateClient(tid);
            }
        }, 180000); // 3 minutes watchdog
    };

    const clearWatchdog = () => {
        if (tenantData.watchdogTimer) {
            clearTimeout(tenantData.watchdogTimer);
            tenantData.watchdogTimer = null;
        }
    };

    startWatchdog();

    client.on('qr', async (qr) => {
        clearWatchdog();
        tenantData.status = 'qr';
        tenantData.number = null;
        try {
            tenantData.qr = await QRCodeLib.toDataURL(qr);
            console.log(`[QR] New QR code generated for tenant: ${tid}`);
            if (tid === 'system') {
                console.log('\n==================================================================');
                console.log('   SCAN THIS QR CODE WITH YOUR WHATSAPP APP TO LINK YOUR ACCOUNT   ');
                console.log('==================================================================\n');
                qrcode.generate(qr, { small: true });
                console.log('\nInstructions: Open WhatsApp > Settings > Linked Devices > Link a Device.');
            }
        } catch (err) {
            console.error(`[QR Error] Failed to generate QR URL for tenant ${tid}:`, err);
        }
        await logHealthEvent('qr_generated', 'warning', { tenantId: tid });
    });
    client.on('authenticated', async () => {
        clearWatchdog();
        tenantData.status = 'authenticating';
        tenantData.qr = null;
        console.log(`[Authenticated] Tenant ${tid} successfully authenticated. Syncing...`);
        await logHealthEvent('authenticated', 'ok', { tenantId: tid });
    });

    client.on('loading_screen', async (percent, message) => {
        clearWatchdog();
        if (tenantData.status === 'ready') {
            console.log(`[Loading Screen] Tenant ${tid}: ${percent}% - ${message} (Ignored because already ready)`);
            return;
        }
        tenantData.status = 'syncing';
        tenantData.syncProgress = { percent, message };
        tenantData.qr = null;
        console.log(`[Loading Screen] Tenant ${tid}: ${percent}% - ${message}`);
    });

    client.on('ready', async () => {
        clearWatchdog();
        tenantData.status = 'ready';
        tenantData.qr = null;
        tenantData.number = client.info?.wid?.user || 'Unknown Device';
        tenantData.sessionSavedAt = new Date().toISOString();
        tenantData.reconnectAttempts = 0;
        console.log(`[Multi-Tenant Ready] Tenant ${tid} is connected as +${tenantData.number}`);
        
        if (supabaseService) {
            await saveSessionToSupabaseScoped(tid);
        }
        await logHealthEvent('connected', 'ok', { tenantId: tid, number: tenantData.number });
    });

    client.on('auth_failure', async (msg) => {
        clearWatchdog();
        tenantData.status = 'auth_failure';
        tenantData.qr = null;
        tenantData.number = null;
        console.error(`[Auth Failure] Tenant ${tid}:`, msg);
        await logHealthEvent('auth_failure', 'error', { tenantId: tid, message: String(msg) });
    });

    client.on('disconnected', async (reason) => {
        clearWatchdog();
        tenantData.status = 'disconnected';
        tenantData.qr = null;
        tenantData.number = null;
        console.log(`[Disconnected] Tenant ${tid} disconnected:`, reason);
        await logHealthEvent('disconnected', 'warning', { tenantId: tid, reason });

        async function attemptReconnect() {
            if (tenantData.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                console.error(`[Reconnect] Tenant ${tid}: All attempts exhausted.`);
                await logHealthEvent('reconnect_failed', 'error', { tenantId: tid, attempts: tenantData.reconnectAttempts, reason });
                return;
            }
            tenantData.reconnectAttempts++;
            const delayMs = 10000 * tenantData.reconnectAttempts;
            console.log(`[Reconnect] Tenant ${tid}: Attempt ${tenantData.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delayMs / 1000}s...`);
            setTimeout(async () => {
                try {
                    await client.initialize();
                } catch (err) {
                    console.error(`[Reconnect] Tenant ${tid} attempt failed:`, err.message);
                    await attemptReconnect();
                }
            }, delayMs);
        }
        attemptReconnect();
    });

    const originalInitialize = client.initialize;
    client.initialize = function() {
        try {
            const tenantFolder = path.join(authDataPath, `session-${tid}`);
            cleanupStaleLockFiles(tenantFolder);
        } catch(e) {
            console.error(`[Cleanup Error] Tenant ${tid} cleanup failed:`, e.message);
        }
        return originalInitialize.apply(this, arguments);
    };

    client.initialize().catch(err => {
        console.error(`[Initialization Error] Tenant ${tid} failed:`, err.message);
    });

    tenantClients.set(tid, tenantData);
    return tenantData;
}

// GET Endpoint to serve visual Gateway Dashboard for CodeArc Administrators (Made by Antigravity)
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeArc RestroSuite - WhatsApp Master Gateway</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --accent: #FF6B00;
            --accent-hover: #E05E00;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --success: #22c55e;
            --warning: #eab308;
            --danger: #ef4444;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Inter', sans-serif;
        }
        body {
            background-color: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            max-width: 480px;
            width: 100%;
            background-color: var(--bg-secondary);
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
            border-top: 4px solid var(--accent);
        }
        .logo-container {
            margin-bottom: 24px;
        }
        .logo-icon {
            font-size: 40px;
            color: var(--accent);
            margin-bottom: 10px;
        }
        h1 {
            font-size: 22px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 6px;
        }
        .subtitle {
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 30px;
        }
        .status-card {
            background-color: rgba(15, 23, 42, 0.6);
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 280px;
        }
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 20px;
        }
        .status-badge.connecting {
            background-color: rgba(234, 179, 8, 0.15);
            color: var(--warning);
            border: 1px solid rgba(234, 179, 8, 0.3);
        }
        .status-badge.ready {
            background-color: rgba(34, 197, 94, 0.15);
            color: var(--success);
            border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .status-badge.qr {
            background-color: rgba(199, 138, 74, 0.15);
            color: var(--accent);
            border: 1px solid rgba(199, 138, 74, 0.3);
        }
        .status-badge.disconnected, .status-badge.auth_failure {
            background-color: rgba(239, 68, 68, 0.15);
            color: var(--danger);
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .qr-image {
            width: 200px;
            height: 200px;
            background-color: white;
            border: 8px solid white;
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .success-icon {
            font-size: 60px;
            color: var(--success);
            margin-bottom: 16px;
            animation: scaleIn 0.3s ease-out;
        }
        .spinner {
            border: 4px solid rgba(255, 255, 255, 0.1);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border-left-color: var(--accent);
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
        }
        .details-text {
            font-size: 14px;
            color: var(--text-secondary);
            margin-top: 10px;
        }
        .number-highlight {
            color: var(--text-primary);
            font-weight: 600;
            font-size: 15px;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background-color: var(--accent);
            color: white;
            border: none;
            padding: 10px 20px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
        }
        .btn:hover {
            background-color: var(--accent-hover);
        }
        .btn-danger {
            background-color: transparent;
            border: 1px solid var(--danger);
            color: var(--danger);
            margin-top: 10px;
        }
        .btn-danger:hover {
            background-color: var(--danger);
            color: white;
        }
        .btn-warning {
            background-color: transparent;
            border: 1px solid var(--warning);
            color: var(--warning);
            margin-top: 10px;
        }
        .btn-warning:hover {
            background-color: var(--warning);
            color: #0f172a;
        }
        .btn-success {
            background-color: var(--success);
            color: white;
        }
        .btn-success:hover {
            background-color: #16a34a;
        }
        .pair-section {
            margin-top: 20px;
            padding: 16px;
            background: rgba(201, 138, 74, 0.08);
            border: 1px solid rgba(201, 138, 74, 0.25);
            border-radius: 10px;
            text-align: left;
            width: 100%;
        }
        .pair-section h4 {
            font-size: 12px;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .pair-input {
            width: 100%;
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid #334155;
            color: var(--text-primary);
            padding: 9px 12px;
            border-radius: 7px;
            font-size: 13px;
            margin-bottom: 8px;
            box-sizing: border-box;
        }
        .pair-input:focus {
            outline: none;
            border-color: var(--accent);
        }
        .pair-code-display {
            font-size: 26px;
            font-weight: 800;
            letter-spacing: 8px;
            color: var(--accent);
            text-align: center;
            padding: 14px;
            background: rgba(201, 138, 74, 0.1);
            border-radius: 8px;
            border: 1px dashed rgba(201, 138, 74, 0.4);
            margin: 10px 0;
            font-family: monospace;
        }
        .footer {
            margin-top: 30px;
            font-size: 11px;
            color: var(--text-secondary);
        }
        .footer a {
            color: var(--accent);
            text-decoration: none;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes scaleIn {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo-container">
            <i class="fa-solid fa-server logo-icon"></i>
            <h1>CodeArc RestroSuite</h1>
            <p class="subtitle">Platform Master WhatsApp & Email Gateway</p>
        </div>

        <div class="status-card" id="status-card">
            <div class="spinner"></div>
            <p>Initializing connection status...</p>
        </div>

        <div id="action-container" style="display: none; flex-direction: column; gap: 8px; align-items: center; margin-top: 20px;">
            <button class="btn btn-danger" id="logout-btn" style="width: 100%; justify-content: center;"><i class="fa-solid fa-link-slash"></i> Unlink WhatsApp Account</button>
            <button class="btn btn-warning" id="reset-btn" style="width: 100%; justify-content: center;"><i class="fa-solid fa-arrows-rotate"></i> Force Reset Gateway</button>
        </div>

        <div id="pair-container" style="display:none; margin-top:16px; width:100%;">
            <div class="pair-section">
                <h4><i class="fa-solid fa-mobile-screen"></i> Can't scan? Use Pairing Code</h4>
                <p class="details-text" style="font-size:12px; margin-bottom: 10px; margin-top: 0;">Enter the WhatsApp number (with country code, no + or spaces)</p>
                <input type="tel" id="pair-phone" class="pair-input" placeholder="e.g. 919983721179" />
                <button class="btn btn-success" id="pair-btn" style="width:100%; justify-content:center; margin-top:4px;">
                    <i class="fa-solid fa-key"></i> Get Pairing Code
                </button>
                <div id="pair-result" style="display:none;"></div>
            </div>
        </div>

        <div class="footer">
            Platform Gateway &copy; 2026 CodeArc. Support: <a href="mailto:hello@codearc.co.in">hello@codearc.co.in</a>
        </div>
    </div>

    <script>
        const statusCard = document.getElementById('status-card');
        const actionContainer = document.getElementById('action-container');
        const pairContainer = document.getElementById('pair-container');
        const logoutBtn = document.getElementById('logout-btn');
        const resetBtn = document.getElementById('reset-btn');
        const pairBtn = document.getElementById('pair-btn');
        let checkInterval = null;
        let lastRenderedStatus = null;

        // Attach pairing code button listener once (persistent element)
        if (pairBtn) pairBtn.addEventListener('click', requestPairingCode);

        function getAuthToken() {
            return window.location.hash ? window.location.hash.substring(1) : '';
        }

        async function updateStatus() {
            const token = getAuthToken();
            const headers = {};
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }

            try {
                const response = await fetch('/status', { headers });
                if (!response.ok) throw new Error("HTTP error " + response.status);
                const data = await response.json();
                
                // Skip re-rendering if still in 'qr' state and user is typing in the pair input
                const pairInput = document.getElementById('pair-phone');
                const userIsTyping = pairInput && (document.activeElement === pairInput || pairInput.value.length > 0);
                if (data.status === 'qr' && lastRenderedStatus === 'qr' && userIsTyping) {
                    return; // Don't wipe the input while user is typing
                }

                renderState(data.status, data.qr, data.number, data.secured);
            } catch (err) {
                console.error("Failed to query gateway status:", err);
                statusCard.innerHTML = \`
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 40px; color: var(--danger); margin-bottom:16px;"></i>
                    <p>Gateway server connection offline.</p>
                \`;
                actionContainer.style.display = 'none';
                if (pairContainer) pairContainer.style.display = 'none';
            }
        }

        function renderState(status, qr, number, secured) {
            lastRenderedStatus = status;
            let statusText = status.toUpperCase();
            let statusClass = status;

            let badgeHtml = \`<span class="status-badge \${statusClass}"><i class="fa-solid fa-circle"></i> \${statusText}</span>\`;
            let contentHtml = '';
            
            if (secured) {
                actionContainer.style.display = 'none';
            } else {
                actionContainer.style.display = 'flex';
                logoutBtn.style.display = (status === 'ready') ? 'inline-flex' : 'none';
                resetBtn.style.display = 'inline-flex';
            }

            // Show/hide pairing section only when QR is active
            if (pairContainer) {
                pairContainer.style.display = (status === 'qr' && qr && !secured) ? 'block' : 'none';
            }
            
            if (status === 'ready') {
                contentHtml = \`
                    \${badgeHtml}
                    <i class="fa-solid fa-circle-check success-icon"></i>
                    <p class="details-text">CodeArc WhatsApp is fully linked and active.</p>
                    <p class="details-text">Active Number: <span class="number-highlight">+\${number || 'Unknown'}</span></p>
\`;
            } else if (status === 'qr') {
                if (qr) {
                    contentHtml = \`
                        \${badgeHtml}
                        <img src="\${qr}" class="qr-image" alt="WhatsApp QR Code">
                        <p class="details-text" style="margin-top: 15px; font-weight: 500;">Scan with CodeArc's Official WhatsApp to link.</p>
                        <p class="details-text" style="font-size:12px;">Settings > Linked Devices > Link a Device</p>
\`;
                } else {
                    contentHtml = \`
                        \${badgeHtml}
                        <div class="spinner"></div>
                        <p class="details-text">Generating QR code...</p>
\`;
                }
            } else if (status === 'connecting') {
                contentHtml = \`
                    \${badgeHtml}
                    <div class="spinner"></div>
                    <p class="details-text">Establishing connection with WhatsApp Web drivers...</p>
                    <p class="details-text" style="font-size: 11px; margin-top: 10px; color: var(--text-secondary);">If stuck for more than 2 minutes, use <strong>Force Reset Gateway</strong> below.</p>
\`;
            } else {
                contentHtml = \`
                    \${badgeHtml}
                    <i class="fa-solid fa-circle-xmark" style="font-size: 50px; color: var(--danger); margin-bottom: 16px;"></i>
                    <p class="details-text">Driver Status: <span style="font-weight: 600;">\${statusText}</span></p>
                    <p class="details-text" style="font-size: 12px; max-width: 280px;">Please check the server console logs for exact failure details.</p>
\`;
            }

            statusCard.innerHTML = contentHtml;
        }

        logoutBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to unlink CodeArc's WhatsApp device? Registration and approval notifications will be disabled until re-linked.")) return;
            
            const token = getAuthToken();
            const headers = {};
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }

            try {
                const response = await fetch('/logout', {
                    method: 'POST',
                    headers
                });
                const data = await response.json();
                if (data.status === 'success') {
                    alert("WhatsApp account unlinked successfully. Scan the new QR code.");
                    updateStatus();
                } else {
                    alert("Failed to unlink: " + (data.error || "Unknown error"));
                }
            } catch (err) {
                alert("Network error: " + err.message);
            }
        });

        resetBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to force reset the gateway? This will delete the saved session from Supabase Storage and the local cache, and restart the gateway container to generate a fresh QR code.")) return;
            
            const token = getAuthToken();
            const headers = {};
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }

            try {
                statusCard.innerHTML = \`
                    <div class="spinner"></div>
                    <p>Resetting gateway & restarting server...</p>
                \`;
                actionContainer.style.display = 'none';

                const response = await fetch('/reset', {
                    method: 'POST',
                    headers
                });
                const data = await response.json();
                if (data.status === 'success') {
                    alert("Gateway reset initiated. Please wait 1-2 minutes for the server to restart and generate a fresh QR code.");
                } else {
                    alert("Failed to reset: " + (data.error || "Unknown error"));
                    updateStatus();
                }
            } catch (err) {
                alert("Gateway reset command sent successfully. The server is restarting now. Please wait 1-2 minutes, then refresh this page to scan the fresh QR code!");
                location.reload();
            }
        });

        async function requestPairingCode() {
            const phoneInput = document.getElementById('pair-phone');
            const resultDiv = document.getElementById('pair-result');
            const pairBtn = document.getElementById('pair-btn');
            const phone = (phoneInput ? phoneInput.value : '').replace(/\\D/g, '').trim();
            if (!phone || phone.length < 10) {
                alert('Please enter a valid phone number with country code (e.g. 919983721179).');
                return;
            }
            if (pairBtn) {
                pairBtn.disabled = true;
                pairBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Requesting...';
            }
            if (resultDiv) resultDiv.style.display = 'none';

            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;

            try {
                const response = await fetch('/pair-code', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ phone })
                });
                const data = await response.json();
                if (resultDiv) {
                    resultDiv.style.display = 'block';
                    if (data.code) {
                        resultDiv.innerHTML = \`
                            <p class="details-text" style="text-align:center; font-size:12px; margin-top:12px;">Open WhatsApp → Settings → Linked Devices → Link a Device → <strong>Link with phone number instead</strong></p>
                            <div class="pair-code-display">\${data.code}</div>
                            <p class="details-text" style="text-align:center; font-size:11px; color: var(--warning);">⚠️ Enter this code in WhatsApp within 60 seconds!</p>
                        \`;
                    } else {
                        resultDiv.innerHTML = \`<p class="details-text" style="color: var(--danger); margin-top:10px;">❌ \${data.error || 'Failed to get pairing code.'}</p>\`;
                    }
                }
            } catch (err) {
                if (resultDiv) {
                    resultDiv.style.display = 'block';
                    resultDiv.innerHTML = \`<p class="details-text" style="color: var(--danger); margin-top:10px;">❌ Network error: \${err.message}</p>\`;
                }
            } finally {
                if (pairBtn) {
                    pairBtn.disabled = false;
                    pairBtn.innerHTML = '<i class="fa-solid fa-key"></i> Get Pairing Code';
                }
            }
        }

        updateStatus();
        checkInterval = setInterval(updateStatus, 2500);
        window.addEventListener('hashchange', updateStatus);
    </script>
</body>
</html>
    `);
});

// POST Endpoint to request a pairing code (alternative to QR scan)
app.post('/pair-code', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const tenantId = req.headers['x-tenant-id'] || 'system';
    const tenantData = getOrCreateClient(tenantId);
    let { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ status: 'error', error: 'Missing phone number' });
    }

    // Clean phone number
    phone = String(phone).replace(/\D/g, '');
    if (phone.length < 10) {
        return res.status(400).json({ status: 'error', error: 'Invalid phone number. Use country code format e.g. 919983721179' });
    }

    if (tenantData.status !== 'qr') {
        return res.status(400).json({ 
            status: 'error', 
            error: `Gateway for tenant ${tenantId} is in '${tenantData.status}' state. Pairing code only works when status is 'qr'. If gateway is already ready, no linking is needed.`
        });
    }

    try {
        console.log(`[Pair Code] Requesting pairing code for tenant ${tenantId} and +${maskPhone(phone)}...`);
        const code = await tenantData.client.requestPairingCode(phone);
        console.log(`[Pair Code] ✅ Pairing code generated for tenant ${tenantId} and +${maskPhone(phone)}: ${code}`);
        await logHealthEvent('pair_code_requested', 'ok', { tenantId, phone: maskPhone(phone) });
        res.json({ status: 'success', code, phone: maskPhone(phone) });
    } catch (err) {
        console.error(`[Pair Code Error] Failed to request pairing code for tenant ${tenantId}:`, err.message);
        await logHealthEvent('pair_code_failed', 'error', { tenantId, phone: maskPhone(phone), error: err.message });
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// GET Endpoint to debug and manually trigger polling fallback (Made by Antigravity)
app.get('/debug-poll', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const force = req.query.force === 'true';
    try {
        console.log(`[Debug Poll] Triggering polling fallback manually (force: ${force})...`);
        if (!supabaseService) {
            return res.json({ status: 'error', reason: 'SUPABASE_SERVICE_KEY not set' });
        }

        // 1. Get all registrations from saas_tenants in the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: tenants, error: tenantErr } = await supabaseService
            .from('saas_tenants')
            .select('*')
            .gt('created_at', oneDayAgo);

        if (tenantErr) {
            return res.json({ status: 'error', location: 'saas_tenants select', error: tenantErr });
        }

        // 2. Get all notified slugs from gateway_health_log
        const { data: logs, error: logErr } = await supabaseService
            .from('gateway_health_log')
            .select('details')
            .eq('event', 'registration_received')
            .gt('created_at', oneDayAgo);

        if (logErr) {
            return res.json({ status: 'error', location: 'gateway_health_log select', error: logErr });
        }

        const notifiedSlugs = [];
        if (logs) {
            logs.forEach(log => {
                if (log.details && log.details.slug) {
                    notifiedSlugs.push(log.details.slug);
                }
            });
        }

        // 3. Process
        const results = [];
        for (const tenant of tenants) {
            const alreadyNotified = force ? false : notifiedSlugs.includes(tenant.slug);
            results.push({ name: tenant.name, slug: tenant.slug, alreadyNotified });
            if (!alreadyNotified) {
                await handleNewRegistrationNotification(tenant);
            }
        }

        return res.json({ status: 'success', tenantsCount: tenants.length, results });

    } catch (err) {
        return res.json({ status: 'error', message: err.message, stack: err.stack });
    }
});

// GET Endpoint to read current gateway connection state
app.get('/status', (req, res) => {
    const isAuthorized = verifyToken(req);
    const tenantId = req.headers['x-tenant-id'] || 'system';
    const tenantData = getOrCreateClient(tenantId);

    if (isAuthorized) {
        res.json({
            status: tenantData.status,
            authenticated: tenantData.status === 'ready',
            number: tenantData.number,
            qr: tenantData.qr,
            sessionSavedAt: tenantData.sessionSavedAt,
            reconnectAttempts: tenantData.reconnectAttempts,
            totalMessagesSent,
            recentHealthEvents
        });
    } else {
        // Return the real status so the dashboard can show QR or connecting states.
        // The QR image is only included when status is 'qr' (it's a one-time-use code and expires automatically).
        // Sensitive data (phone number, session metadata, health events) is always withheld.
        res.json({
            status: tenantData.status === 'ready' ? 'ready' : tenantData.status,
            authenticated: tenantData.status === 'ready',
            qr: tenantData.status === 'qr' ? tenantData.qr : null,
        });
    }
});

// POST Endpoint to log out / unlink the device
app.post('/logout', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const tenantId = req.headers['x-tenant-id'] || 'system';
    console.log(`[Logout] Request received to log out WhatsApp device for tenant: ${tenantId}`);

    try {
        if (tenantClients.has(tenantId)) {
            const tenantData = tenantClients.get(tenantId);
            if (tenantData.status === 'ready') {
                await tenantData.client.logout();
            }
            try { await tenantData.client.destroy(); } catch (_) {}
            
            // Delete auth folder locally
            const tenantFolder = path.join(authDataPath, `session-${tenantId}`);
            if (fs.existsSync(tenantFolder)) {
                fs.rmSync(tenantFolder, { recursive: true, force: true });
                console.log(`[Logout] Purged local session files for tenant ${tenantId}`);
            }
            
            // Delete session file from Supabase Storage
            if (supabaseService) {
                const fileName = `session-${tenantId}.zip`;
                await supabaseService.storage.from(SESSION_BUCKET).remove([fileName]).catch(() => {});
                console.log(`[Logout] Purged remote session zip for tenant ${tenantId}`);
            }
            
            tenantClients.delete(tenantId);
        }
        
        // Re-create as a clean disconnected instance
        getOrCreateClient(tenantId);
        res.json({ status: 'success', message: 'Logged out successfully. Scan QR again.' });
    } catch (err) {
        console.error(`[Logout Error] Tenant ${tenantId}:`, err);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Helper function to perform reset in-process without crashing container
async function performReset(req, res, format = 'json') {
    if (!verifyToken(req)) {
        if (format === 'html') {
            return res.status(401).send('Unauthorized: Invalid Gateway Token');
        } else {
            return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
        }
    }

    const tenantId = req.headers['x-tenant-id'] || 'system';

    try {
        console.log(`[Reset] Force reset initiated for tenant: ${tenantId}...`);

        // 1. Destroy current client browser instance if possible
        if (tenantClients.has(tenantId)) {
            const tenantData = tenantClients.get(tenantId);
            try {
                console.log(`[Reset] Closing active Puppeteer browser session for tenant ${tenantId}...`);
                await tenantData.client.destroy();
            } catch (destroyErr) {
                console.log(`[Reset Warning] Failed to destroy client cleanly for tenant ${tenantId} (safe to ignore):`, destroyErr.message);
            }
            tenantClients.delete(tenantId);
        }

        // 2. Delete session from Supabase Storage
        if (supabaseService) {
            const fileName = `session-${tenantId}.zip`;
            console.log(`[Reset] Deleting ${fileName} from Supabase Storage...`);
            const { data, error } = await supabaseService.storage
                .from(SESSION_BUCKET)
                .remove([fileName]);
            
            if (error) {
                console.error(`[Reset Error] Failed to delete ${fileName} from storage:`, error.message);
            } else {
                console.log(`[Reset] ${fileName} deleted successfully from Supabase Storage.`);
            }
        }

        // 3. Delete local auth directory for this tenant
        const tenantFolder = path.join(authDataPath, `session-${tenantId}`);
        if (fs.existsSync(tenantFolder)) {
            console.log(`[Reset] Deleting local auth directory for tenant ${tenantId}:`, tenantFolder);
            fs.rmSync(tenantFolder, { recursive: true, force: true });
        }

        // 5. Send response to client first
        if (format === 'html') {
            res.send(`
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 40px; background-color: #0f172a; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box;">
                    <div style="max-width: 500px; padding: 30px; border: 1px solid #334155; border-radius: 16px; background-color: #1e293b; border-top: 4px solid #eab308; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);">
                        <h1 style="color: #f8fafc; font-size: 24px; margin-bottom: 15px;">⚡ Gateway Reset Complete</h1>
                        <p style="font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 20px;">
                            The corrupted WhatsApp session for tenant ${tenantId} has been successfully deleted from your Supabase storage and local cache.
                        </p>
                        <p style="font-size: 15px; font-weight: 600; color: #22c55e; margin-bottom: 25px;">
                            The gateway is re-initializing right now! A fresh QR code will display on the dashboard in a few seconds.
                        </p>
                        <hr style="border: 0; border-top: 1px solid #334155; margin-bottom: 20px;">
                        <a href="/" style="background-color: #FF6B00; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
                            Go to Dashboard &rarr;
                        </a>
                    </div>
                </div>
            `);
        } else {
            res.json({ status: 'success', message: `Gateway reset completed for tenant ${tenantId}. Re-initializing driver.` });
        }

        // 6. Spawn new browser instance in background
        console.log(`[Reset] Re-initializing clean WhatsApp driver instance for tenant ${tenantId}...`);
        getOrCreateClient(tenantId);

    } catch (err) {
        console.error(`[Reset Fatal Error] Tenant ${tenantId}:`, err);
        if (format === 'html') {
            res.status(500).send('Error resetting gateway: ' + err.message);
        } else {
            res.status(500).json({ status: 'error', error: err.message });
        }
    }
}

app.post('/reset', (req, res) => performReset(req, res, 'json'));
app.get('/reset', (req, res) => performReset(req, res, 'html'));

// HTTP API Endpoint to send receipts manually in the background
app.post('/send', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const tenantId = req.headers['x-tenant-id'] || 'system';
    const tenantData = getOrCreateClient(tenantId);
    
    if (tenantData.status !== 'ready') {
        return res.status(400).json({ status: 'error', error: `WhatsApp gateway for tenant ${tenantId} is not connected.` });
    }

    let { orderId, phone, message, pdfData, filename } = req.body;
    
    if (!phone || (!message && !pdfData)) {
        return res.status(400).json({ status: 'error', error: 'Missing phone or message' });
    }

    // Clean phone number format
    phone = phone.replace(/\D/g, '');
    if (phone.length === 10 && !phone.startsWith('65') && !phone.startsWith('45') && !phone.startsWith('47') && !phone.startsWith('96') && !phone.startsWith('91')) {
        phone = "91" + phone;
    }

    try {
        const chatId = `${phone}@c.us`;
        
        if (pdfData) {
            const { MessageMedia } = require('whatsapp-web.js');
            const media = new MessageMedia('application/pdf', pdfData, filename || 'receipt.pdf');
            await tenantData.client.sendMessage(chatId, media);
            // Do NOT send a separate text after the PDF — the PDF IS the receipt.
        } else {
            // Send monospaced text receipt
            await tenantData.client.sendMessage(chatId, message);
        }
        
        console.log(`[Manual Sent] WhatsApp receipt successfully delivered for tenant ${tenantId} to: +${maskPhone(phone)}`);

        // Mark this order as handled so the realtime listener doesn't double-send
        if (orderId) {
            const skipKey = `${tenantId}:${orderId}`;
            realtimeSkipOrders.add(skipKey);
            setTimeout(() => realtimeSkipOrders.delete(skipKey), 60_000); // clean up after 60s
        }

        // Tag sending activity securely for this tenant
        await logHealthEvent('send_receipt', 'ok', {
            tenant_id: tenantId,
            phone: maskPhone(phone),
            orderId: orderId,
            message: `Receipt for ${orderId || 'order'} successfully sent to +${maskPhone(phone)}`
        });

        // Broadcast success back to Supabase Realtime
        if (orderId) {
            const channel = supabase.channel('whatsapp-billing-status');
            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.send({
                           type: 'broadcast',
                           event: 'status',
                           payload: { orderId, status: 'success' }
                    });
                    supabase.removeChannel(channel);
                }
            });
        }

        res.json({ status: 'success', message: 'Message sent successfully' });
    } catch (err) {
        console.error(`[Manual Error] Failed to send receipt for tenant ${tenantId} to +${maskPhone(phone)}:`, err.message);

        // Tag sending failure activity securely for this tenant
        await logHealthEvent('send_receipt', 'error', {
            tenant_id: tenantId,
            phone: maskPhone(phone),
            orderId: orderId,
            error: err.message,
            message: `Failed to send receipt for ${orderId || 'order'} to +${maskPhone(phone)}: ${err.message}`
        });
        
        // Broadcast failure back to Supabase Realtime
        if (orderId) {
            const channel = supabase.channel('whatsapp-billing-status');
            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.send({
                        type: 'broadcast',
                        event: 'status',
                        payload: { orderId, status: 'failed', error: err.message }
                    });
                    supabase.removeChannel(channel);
                }
            });
        }
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// HTTP API Endpoint to send emails (Made by Antigravity)
app.post('/send-email', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }

    const { to, subject, text, html } = req.body;

    if (!to || !subject || (!text && !html)) {
        return res.status(400).json({ status: 'error', error: 'Missing to, subject, or body (text/html)' });
    }

    if (!transporter && !emailConfig.relayUrl) {
        return res.status(503).json({ status: 'error', error: 'Email SMTP or HTTP Relay service is not configured on this gateway space.' });
    }

    try {
        const info = await sendMailHelper(to, subject, html, text);
        console.log(`[Email Sent] Message successfully delivered to: ${to} (MessageId: ${info.messageId})`);
        res.json({ status: 'success', messageId: info.messageId });
    } catch (err) {
        console.error(`[Email Error] Failed to send email to ${to}:`, err.message);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Legacy HTTP Webhook Receiver endpoint (retained for backward compatibility)
app.post('/supabase-webhook', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const { type, table, record } = req.body;
    if (type !== 'INSERT' || table !== 'doppio_bills' || !record) {
        return res.status(400).json({ status: 'ignored', reason: 'Not an insert on public.doppio_bills' });
    }
    
    let phone = record.customerPhone;
    const orderId = record.orderId;
    const tenantId = record.tenant_id;

    if (!phone || phone.trim() === '' || phone === 'null') {
        console.log(`[Webhook] Ignored: No phone number provided for bill ${orderId}`);
        return res.json({ status: 'ignored', reason: 'No customer phone number' });
    }

    phone = phone.replace(/\D/g, '');
    if (phone.length === 10 && !phone.startsWith('65') && !phone.startsWith('45') && !phone.startsWith('47') && !phone.startsWith('96') && !phone.startsWith('91')) {
        phone = "91" + phone;
    }

    // Wait 5s — the POS frontend auto-sends after 800ms; this gives it time
    // to call /send first so we can skip if it already handled the bill (PDF mode).
    await new Promise(r => setTimeout(r, 5000));

    // Skip if the POS frontend already handled this order via /send (e.g. PDF mode)
    if (orderId && realtimeSkipOrders.has(`${tenantId}:${orderId}`)) {
        console.log(`[Webhook Skipped] Order ${orderId} already handled by frontend via /send.`);
        return res.json({ status: 'skipped', reason: 'Order already handled via /send' });
    }

    try {
        const chatId = `${phone}@c.us`;
        let uiSettings = {};
        
        // Fetch dynamic business profile for this tenant
        let tenantProfile = { ...businessProfile };
        if (tenantId) {
            const dbClient = supabaseService || supabase;
            const { data: profiles, error: profileErr } = await dbClient
                .from('doppio_business_profile')
                .select('*')
                .eq('tenant_id', tenantId);
            
            if (profileErr) {
                console.error(`[Webhook Error] Failed to fetch profile for tenant ${tenantId}:`, profileErr.message);
            }
            
            if (profiles && profiles.length > 0) {
                tenantProfile.name = profiles[0].business_name || tenantProfile.name;
                tenantProfile.address = profiles[0].address || tenantProfile.address;
                tenantProfile.phone = profiles[0].phone || tenantProfile.phone;
                tenantProfile.gstEnabled = profiles[0].gst_enabled !== false;
                
                // Check if WhatsApp is enabled in tenant business settings
                if (profiles[0].whatsapp_enabled === false) {
                    console.log(`[Webhook Cancelled] WhatsApp receipts are disabled in settings for tenant ${tenantId}.`);
                    return res.json({ status: 'cancelled', reason: 'WhatsApp receipts disabled' });
                }

                // Check bill format preference — if PDF mode, skip auto-send.
                let flags = {};
                try { flags = typeof profiles[0].feature_flags === 'string' ? JSON.parse(profiles[0].feature_flags) : (profiles[0].feature_flags || {}); } catch(e) {}
                uiSettings = flags.ui_settings || {};
                
                // Check if auto-send is disabled
                const autoSendEnabled = uiSettings.set_auto_send_receipts !== false && uiSettings.set_auto_send_receipts !== 'false';
                if (!autoSendEnabled) {
                    console.log(`[Webhook Skipped] Auto-send receipts is disabled for tenant ${tenantId}.`);
                    return res.json({ status: 'skipped', reason: 'Auto-send receipts disabled' });
                }

                const billFormat = uiSettings.set_whatsapp_bill_format || 'Text receipt';
                if (billFormat === 'Thermal PDF receipt') {
                    console.log(`[Webhook Skipped] Tenant ${tenantId} uses PDF receipts — auto-text skipped.`);
                    return res.json({ status: 'skipped', reason: 'Thermal PDF receipt format selected' });
                }
            }
        }

        // Extract tenant currency symbol (WhatsApp-safe ASCII version)
        let currSymbol = 'Rs.';
        try {
            const rawCurr = uiSettings.set_currency || '';
            if (rawCurr) {
                const m = rawCurr.match(/\(([^)]+)\)/);
                const sym = m ? m[1].trim() : rawCurr.trim().split(/\s+/).pop();
                currSymbol = sym
                    .replace(/₹/g, 'Rs.')
                    .replace(/€/g, 'EUR')
                    .replace(/£/g, 'GBP')
                    .replace(/¥/g, 'JPY')
                    .replace(/₩/g, 'KRW')
                    .replace(/₺/g, 'TRY')
                    .replace(/₴/g, 'UAH');
            }
        } catch(currErr) {
            console.warn('[Webhook] Failed to parse currency symbol:', currErr.message);
        }

        const message = formatReceiptText(record, tenantProfile, currSymbol);
        const tenantData = getOrCreateClient(tenantId);
        if (tenantData.status !== 'ready') {
            throw new Error(`WhatsApp gateway for tenant ${tenantId} is not connected.`);
        }
        await tenantData.client.sendMessage(chatId, message);
        console.log(`[Webhook Auto-Sent] WhatsApp receipt successfully delivered to: +${maskPhone(phone)} for order ${orderId}`);
        
        // Broadcast success
        if (orderId) {
            const channel = supabase.channel('whatsapp-billing-status');
            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.send({
                        type: 'broadcast',
                        event: 'status',
                        payload: { orderId, status: 'success' }
                    });
                    supabase.removeChannel(channel);
                }
            });
        }
        res.json({ status: 'success', message: 'Message sent successfully via Webhook' });
    } catch (err) {
        console.error(`[Webhook Error] Failed to send receipt:`, err.message);
        if (orderId) {
            const channel = supabase.channel('whatsapp-billing-status');
            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.send({
                        type: 'broadcast',
                        event: 'status',
                        payload: { orderId, status: 'failed', error: err.message }
                    });
                    supabase.removeChannel(channel);
                }
            });
        }
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Utility to insert zero-width spaces into email addresses and support links
// to prevent WhatsApp from generating generic link previews (like gmail.com)
function escapeLinks(text) {
    if (!text) return text;
    return text.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\.([a-zA-Z]{2,})/g, '$1@$2\u200B.$3')
               .replace(/(?<!https?:\/\/[^\s]*)(?<!www\.)(codearc|gmail)\.(co\.in|com)/gi, '$1\u200B.$2');
}

// Helper to send registration notification (WhatsApp + Email) (Made by Antigravity)
async function handleNewRegistrationNotification(record) {
    const { name, slug, outlet_type, email, phone, username } = record;
    await logHealthEvent('registration_received', 'ok', { name, slug, email, phone });
    
    // Format phone number nicely (e.g., +91 99837 21179)
    let targetPhone = phone ? phone.replace(/\D/g, '') : '';
    if (targetPhone.length === 10 && !targetPhone.startsWith('65') && !targetPhone.startsWith('45') && !targetPhone.startsWith('47') && !targetPhone.startsWith('96') && !targetPhone.startsWith('91')) {
        targetPhone = "91" + targetPhone;
    }
    const formattedPhone = (targetPhone.startsWith('91') && targetPhone.length === 12) 
        ? `+91 ${targetPhone.slice(2, 7)} ${targetPhone.slice(7)}` 
        : (phone ? `+${phone.replace(/\D/g, '')}` : 'N/A');

    // 1. Send WhatsApp Confirmation
    const systemData = getOrCreateClient('system');
    if (phone && systemData.status === 'ready') {
        const chatId = `${targetPhone}@c.us`;
        const typeStr = (outlet_type || 'cafe').toUpperCase();
        const displayType = typeStr === 'RESTAURANT' ? 'Restaurant' : typeStr === 'CAFE' ? 'Cafe' : typeStr;
        
        const msgText = `🎉 *CodeArc RestroSuite Registration Received*\n\n🏪 *Outlet:* ${name}\n🍽️ *Type:* ${displayType}\n🆔 *Outlet ID:* ${slug}\n👤 *Admin:* ${username}\n\n⏳ *Status:* Pending Approval\n\nWe are reviewing your registration.\nYou will receive login details after approval.\n\nNeed help?\n📞 +91 99837 21179\n🌐 codearc.co.in\n\n— *CodeArc RestroSuite*`;
        
        try {
            await systemData.client.sendMessage(chatId, escapeLinks(msgText), { linkPreview: false });
            console.log(`[Realtime WhatsApp] Registration confirmation sent to +${maskPhone(targetPhone)}`);
            await logHealthEvent('registration_whatsapp_sent', 'ok', { phone: targetPhone, name });
        } catch (err) {
            console.error(`[Realtime WhatsApp Error] Failed to send registration confirmation to +${targetPhone}:`, err.message);
            await logHealthEvent('registration_whatsapp_failed', 'error', { phone: targetPhone, error: err.message });
        }
    } else {
        await logHealthEvent('registration_whatsapp_skipped', 'warning', {
            reason: !phone ? 'no_phone' : `gateway_status_${systemData.status}`
        });
    }

    // Registration emails are owned by the Supabase notify-registration function.
    // Keep this opt-in only for deployments that intentionally use the gateway as the sender.
    if (REGISTRATION_EMAILS_ENABLED && email && (transporter || emailConfig.relayUrl)) {
        const typeStr = (outlet_type || 'cafe').toUpperCase();
        const displayType = typeStr === 'RESTAURANT' ? 'Restaurant' : typeStr === 'CAFE' ? 'Cafe' : typeStr;
        const emailSubject = `Registration Received - CodeArc RestroSuite (Outlet: ${name})`;
        const emailHtml = `<!DOCTYPE html>
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
              <div style="height:4px; background:#FF6B00;"></div>
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
                      color:#E05E00;
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
                  background:#FF6B00;
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
        
        sendMailHelper(email, emailSubject, emailHtml)
            .then(() => {
                console.log(`[Realtime Email] Registration confirmation email sent to ${email}`);
                logHealthEvent('registration_email_sent', 'ok', { email, name });
            })
            .catch(err => {
                console.error(`[Realtime Email Error] Failed to send registration confirmation email to ${email}:`, err.message);
                logHealthEvent('registration_email_failed', 'error', { email, error: err.message });
            });
    } else {
        await logHealthEvent('registration_email_skipped', 'warning', {
            reason: !REGISTRATION_EMAILS_ENABLED
                ? 'handled_by_supabase_edge_function'
                : (!email ? 'no_email' : 'transporter_and_relay_not_configured')
        });
    }
}

// Helper to send approval notification (WhatsApp + Email) (Made by Antigravity)
async function handleApprovalNotification(record) {
    const { name, slug, email, phone, username } = record;
    await logHealthEvent('approval_received', 'ok', { name, slug, email, phone });

    // 1. Send WhatsApp Approval Alert
    const systemData = getOrCreateClient('system');
    if (phone && systemData.status === 'ready') {
        let targetPhone = phone.replace(/\D/g, '');
        if (targetPhone.length === 10 && !targetPhone.startsWith('65') && !targetPhone.startsWith('45') && !targetPhone.startsWith('47') && !targetPhone.startsWith('96') && !targetPhone.startsWith('91')) {
            targetPhone = "91" + targetPhone;
        }
        const chatId = `${targetPhone}@c.us`;
        const msgText = `Dear Partner,\n\nWe are pleased to inform you that your registration request for *${name}* has been reviewed and approved by the CodeArc Operations Team. Your account is now fully active.\n\n*Access Credentials:*\n• *Outlet ID (Slug):* ${slug}\n• *Administrator Username:* ${username}\n\n*Management Portal Link:* https://restrosuite.codearc.co.in/login.html\n\nYou may now log in to the portal to configure your outlet settings, menu inventory, and employee rosters.\n\nShould you require any assistance or launch support, please contact our support desk at hello@codearc.co.in.\n\nSincerely,\n*CodeArc Operations Team*`;
        
        try {
            await systemData.client.sendMessage(chatId, escapeLinks(msgText), { linkPreview: false });
            console.log(`[Realtime WhatsApp] Account approval alert sent to +${maskPhone(targetPhone)}`);
            await logHealthEvent('approval_whatsapp_sent', 'ok', { phone: targetPhone, name });
        } catch (err) {
            console.error(`[Realtime WhatsApp Error] Failed to send account approval alert to +${targetPhone}:`, err.message);
            await logHealthEvent('approval_whatsapp_failed', 'error', { phone: targetPhone, error: err.message });
        }
    } else {
        await logHealthEvent('approval_whatsapp_skipped', 'warning', {
            reason: !phone ? 'no_phone' : `gateway_status_${systemData.status}`
        });
    }

    // Approval emails are owned by the Supabase notify-registration function.
    if (REGISTRATION_EMAILS_ENABLED && email && (transporter || emailConfig.relayUrl)) {
        const emailSubject = `Account Approved & Active - CodeArc RestroSuite (Outlet: ${name})`;
        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b; background: #ffffff;">
          <div style="border-bottom: 2px solid #22c55e; padding-bottom: 12px; margin-bottom: 20px;">
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
            <a href="https://restrosuite.codearc.co.in/login.html" style="background: #22c55e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Access Login Portal</a>
          </div>

          <p style="font-size: 14px; line-height: 1.6;">Please log in to review your outlet configuration, tax parameters, menu settings, and employee rosters to commence operations.</p>
          
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="font-size: 13px; color: #475569; margin-bottom: 8px;">For any inquiries or onboarding support, please contact our department:</p>
          <ul style="font-size: 13px; color: #475569; padding-left: 20px; margin-top: 0; line-height: 1.6;">
            <li>Email: hello@codearc.co.in</li>
            <li>Phone: +91 99837 21179</li>
          </ul>
          
          <p style="font-size: 11px; color: #94a3b8; margin-top: 24px; text-align: center;">Welcome to the CodeArc RestroSuite platform.</p>
        </div>
        `;

        sendMailHelper(email, emailSubject, emailHtml)
            .then(() => {
                console.log(`[Realtime Email] Account approval email sent to ${email}`);
                logHealthEvent('approval_email_sent', 'ok', { email, name });
            })
            .catch(err => {
                console.error(`[Realtime Email Error] Failed to send account approval email to ${email}:`, err.message);
                logHealthEvent('approval_email_failed', 'error', { email, error: err.message });
            });
    } else {
        await logHealthEvent('approval_email_skipped', 'warning', {
            reason: !REGISTRATION_EMAILS_ENABLED
                ? 'handled_by_supabase_edge_function'
                : (!email ? 'no_email' : 'transporter_and_relay_not_configured')
        });
    }
}

// ======================================================
// POLLING FALLBACK FOR RELIABLE NOTIFICATIONS (Made by Antigravity)
// ======================================================
async function runNotificationPollingFallback() {
    if (!supabaseService) {
        console.warn('[Polling Fallback] SUPABASE_SERVICE_KEY not set. Polling skipped.');
        return;
    }

    try {
        // 1. Get all registrations from saas_tenants in the last 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: tenants, error: tenantErr } = await supabaseService
            .from('saas_tenants')
            .select('*')
            .gt('created_at', oneDayAgo);

        if (tenantErr) throw tenantErr;
        if (!tenants || tenants.length === 0) return;

        // 2. Get all notified slugs from gateway_health_log
        const { data: logs, error: logErr } = await supabaseService
            .from('gateway_health_log')
            .select('details')
            .eq('event', 'registration_received')
            .gt('created_at', oneDayAgo);

        if (logErr) throw logErr;

        const notifiedSlugs = new Set();
        if (logs) {
            logs.forEach(log => {
                if (log.details && log.details.slug) {
                    notifiedSlugs.add(log.details.slug);
                }
            });
        }

        // 3. Find any registrations that haven't been notified
        for (const tenant of tenants) {
            if (!notifiedSlugs.has(tenant.slug)) {
                console.log(`[Polling Fallback] Found un-notified registration: ${tenant.name} (${tenant.slug}). Notifying...`);
                await handleNewRegistrationNotification(tenant);
            }
        }
        
        // 4. Do the same for approved status transition
        const approvedTenants = tenants.filter(t => t.status === 'approved');
        if (approvedTenants.length > 0) {
            const { data: approvalLogs, error: approvalLogErr } = await supabaseService
                .from('gateway_health_log')
                .select('details')
                .eq('event', 'approval_received')
                .gt('created_at', oneDayAgo);
                
            if (approvalLogErr) throw approvalLogErr;
            
            const notifiedApprovalSlugs = new Set();
            if (approvalLogs) {
                approvalLogs.forEach(log => {
                    if (log.details && log.details.slug) {
                        notifiedApprovalSlugs.add(log.details.slug);
                    }
                });
            }
            
            for (const tenant of approvedTenants) {
                if (!notifiedApprovalSlugs.has(tenant.slug)) {
                    console.log(`[Polling Fallback] Found un-notified approval: ${tenant.name} (${tenant.slug}). Notifying...`);
                    await handleApprovalNotification(tenant);
                }
            }
        }

    } catch (err) {
        console.error('[Polling Fallback Error]', err.message);
    }
}

// ======================================================
// NATIVE SUPABASE REALTIME DB LISTENERS
// ======================================================
const dbClientForRealtime = supabaseService || supabase;
const realtimeChannel = dbClientForRealtime
    .channel('doppio-realtime-listener')
    .on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'doppio_bills'
        },
        async (payload) => {
            const record = payload.new;
            const orderId = record.orderId;
            let phone = record.customerPhone;
            const tenantId = record.tenant_id;

            console.log(`[Realtime Triggered] Detected new bill insert in cloud db: ${orderId} for tenant: ${tenantId}`);

            // Wait 5s — the POS frontend auto-sends after 800ms; this gives it time
            // to call /send first so we can skip if it already handled the bill (PDF mode).
            await new Promise(r => setTimeout(r, 5000));

            // Skip if the POS frontend already handled this order via /send (e.g. PDF mode)
            if (orderId && realtimeSkipOrders.has(`${tenantId}:${orderId}`)) {
                console.log(`[Realtime Skipped] Order ${orderId} already handled by frontend via /send.`);
                return;
            }

            if (!phone || phone.trim() === '' || phone === 'null') {
                console.log(`[Realtime Triggered] Ignored: No phone number provided for bill ${orderId}`);
                return;
            }

            phone = phone.replace(/\D/g, '');
            if (phone.length === 10 && !phone.startsWith('65') && !phone.startsWith('45') && !phone.startsWith('47') && !phone.startsWith('96') && !phone.startsWith('91')) {
                phone = "91" + phone;
            }

            try {
                const chatId = `${phone}@c.us`;
                let uiSettings = {};
                
                // Fetch dynamic business profile for this tenant
                let tenantProfile = { ...businessProfile };
                if (tenantId) {
                    const dbClient = supabaseService || supabase;
                    const { data: profiles, error: profileErr } = await dbClient
                        .from('doppio_business_profile')
                        .select('*')
                        .eq('tenant_id', tenantId);
                    
                    if (profileErr) {
                        console.error(`[Realtime Error] Failed to fetch profile for tenant ${tenantId}:`, profileErr.message);
                    }
                    
                    if (profiles && profiles.length > 0) {
                        tenantProfile.name = profiles[0].business_name || tenantProfile.name;
                        tenantProfile.address = profiles[0].address || tenantProfile.address;
                        tenantProfile.phone = profiles[0].phone || tenantProfile.phone;
                        tenantProfile.gstEnabled = profiles[0].gst_enabled !== false;
                        
                        // Check if WhatsApp is enabled in tenant business settings
                        if (profiles[0].whatsapp_enabled === false) {
                            console.log(`[Realtime Cancelled] WhatsApp receipts are disabled in settings for tenant ${tenantId}.`);
                            return;
                        }

                        // Check bill format preference — if PDF mode, skip auto-send from realtime listener.
                        // The POS frontend will handle PDF generation and delivery via the /send endpoint.
                        let flags = {};
                        try { flags = typeof profiles[0].feature_flags === 'string' ? JSON.parse(profiles[0].feature_flags) : (profiles[0].feature_flags || {}); } catch(e) {}
                        uiSettings = flags.ui_settings || {};

                        // Check if auto-send is disabled
                        const autoSendEnabled = uiSettings.set_auto_send_receipts !== false && uiSettings.set_auto_send_receipts !== 'false';
                        if (!autoSendEnabled) {
                            console.log(`[Realtime Skipped] Auto-send receipts is disabled for tenant ${tenantId}.`);
                            return;
                        }

                        const billFormat = uiSettings.set_whatsapp_bill_format || 'Text receipt';
                        if (billFormat === 'Thermal PDF receipt') {
                            console.log(`[Realtime Skipped] Tenant ${tenantId} uses PDF receipts — auto-text skipped. POS frontend will send PDF via /send.`);
                            return;
                        }
                    }
                }

                // Extract tenant currency symbol (WhatsApp-safe ASCII version)
                let currSymbol = 'Rs.';
                try {
                    const rawCurr = uiSettings.set_currency || '';
                    if (rawCurr) {
                        // Handle "EUR (€)" → extract €
                        const m = rawCurr.match(/\(([^)]+)\)/);
                        const sym = m ? m[1].trim() : rawCurr.trim().split(/\s+/).pop();
                        // Convert multi-byte symbols to ASCII-safe equivalents for WhatsApp
                        currSymbol = sym
                            .replace(/₹/g, 'Rs.')
                            .replace(/€/g, 'EUR')
                            .replace(/£/g, 'GBP')
                            .replace(/¥/g, 'JPY')
                            .replace(/₩/g, 'KRW')
                            .replace(/₺/g, 'TRY')
                            .replace(/₴/g, 'UAH');
                    }
                } catch(currErr) {
                    console.warn('[Realtime] Failed to parse currency symbol:', currErr.message);
                }

                // Format clean text receipt (matching POS frontend format)
                const message = formatReceiptText(record, tenantProfile, currSymbol);
                
                // Dispatch message via Whatsapp
                const tenantData = getOrCreateClient(tenantId);
                if (tenantData.status === 'ready') {
                    await tenantData.client.sendMessage(chatId, message);
                    console.log(`[Realtime Auto-Sent] WhatsApp receipt successfully delivered to: +${maskPhone(phone)} for order ${orderId} (tenant: ${tenantId})`);
                    
                    // Broadcast success back to POS Web Clients
                    const broadcastChannel = supabase.channel('whatsapp-billing-status');
                    broadcastChannel.subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            await broadcastChannel.send({
                                type: 'broadcast',
                                event: 'status',
                                payload: { orderId, status: 'success' }
                            });
                            supabase.removeChannel(broadcastChannel);
                        }
                    });
                } else {
                    console.warn(`[Realtime Delay] WhatsApp gateway for tenant ${tenantId} not connected (Status: ${tenantData.status}). Cannot dispatch message.`);
                }
            } catch (err) {
                console.error(`[Realtime Error] Failed to send receipt for order ${orderId} to +${phone}:`, err.message);
                
                // Broadcast failure back to POS Web Clients
                const broadcastChannel = supabase.channel('whatsapp-billing-status');
                broadcastChannel.subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await broadcastChannel.send({
                            type: 'broadcast',
                            event: 'status',
                            payload: { orderId, status: 'failed', error: err.message }
                        });
                        supabase.removeChannel(broadcastChannel);
                    }
                });
            }
        }
    )
    .on(
        'postgres_changes',
        {
            event: 'INSERT',
            schema: 'public',
            table: 'saas_tenants'
        },
        async (payload) => {
            const record = payload.new;
            console.log(`[Realtime SaaS] Detected new registration insert: ${record.name} (${record.slug})`);
            await handleNewRegistrationNotification(record);
        }
    )
    .on(
        'postgres_changes',
        {
            event: 'UPDATE',
            schema: 'public',
            table: 'saas_tenants'
        },
        async (payload) => {
            const oldRecord = payload.old;
            const newRecord = payload.new;
            
            // Check if status transitioned from pending to approved
            // Note: If replica identity full is not set, oldRecord might only contain the ID.
            // In that case, we fall back to checking if newRecord status is 'approved' and oldRecord.status was undefined (or not 'approved').
            const oldStatus = oldRecord ? oldRecord.status : null;
            const newStatus = newRecord ? newRecord.status : null;
            
            console.log(`[Realtime SaaS] Detected tenant update: ${newRecord.name} (Status: ${oldStatus} -> ${newStatus})`);
            
            if (newStatus === 'approved' && oldStatus !== 'approved') {
                await handleApprovalNotification(newRecord);
            }
        }
    );

realtimeChannel.subscribe((status) => {
    console.log(`[Realtime Sub] Connected to Supabase Postgres Replication status: ${status}`);
});

// ======================================================
// MONOSPACE RECEIPT FORMATTER UTILITIES
// ======================================================
const businessProfile = {
    name: process.env.BUSINESS_NAME || 'RESTROSUITE',
    address: process.env.BUSINESS_ADDRESS || '',
    phone: process.env.BUSINESS_PHONE || '',
    gstEnabled: true
};

function getFallbackCategoryIcon(term) {
    const t = String(term).toLowerCase();
    if (t.includes('sandwich') || t.includes('panini')) return '🥪';
    if (t.includes('fries') || t.includes('peri')) return '🍟';
    if (t.includes('shake') || t.includes('frappe') || t.includes('thickshake')) return '🥤';
    if (t.includes('latte') || t.includes('matcha') || t.includes('milk')) return '🥛';
    if (t.includes('croissant') || t.includes('pastry') || t.includes('bakery')) return '🥐';
    return '☕';
}

function getRandomGoodVibeQuote(record) {
    let orderId = record.orderId || '';
    let hasFood = false;
    let hasDrinks = false;
    let items = [];
    try {
        items = typeof record.items === 'string' ? JSON.parse(record.items) : record.items;
    } catch (e) {
        items = [];
    }
    if (Array.isArray(items)) {
        items.forEach(item => {
            const name = String(item.name || '').toLowerCase();
            const cat = String(item.category || '').toLowerCase();
            if (name.includes('sandwich') || name.includes('fries') || name.includes('panini') || name.includes('burger') || name.includes('snack') || name.includes('munch') || cat.includes('food') || cat.includes('snack') || cat.includes('snacks')) {
                hasFood = true;
            }
            if (name.includes('coffee') || name.includes('latte') || name.includes('matcha') || name.includes('frappe') || name.includes('shake') || name.includes('tea') || cat.includes('beverage') || cat.includes('coffee') || cat.includes('drinks')) {
                hasDrinks = true;
            }
        });
    }

    let quotes = [];
    if (hasFood && !hasDrinks) {
        quotes = [
            "Prepared with fresh, premium ingredients",
            "Freshly prepared for your satisfaction",
            "Quality dining, crafted with care",
            "Thank you for choosing our kitchen"
        ];
    } else if (hasDrinks && !hasFood) {
        quotes = [
            "Freshly prepared for your satisfaction",
            "Crafted to elevate your day",
            "Quality beverage, freshly prepared",
            "Thank you for choosing our service"
        ];
    } else {
        quotes = [
            "We appreciate your patronage",
            "Thank you for your valued business",
            "Committed to quality and service",
            "We look forward to serving you again",
            "Your satisfaction is our priority"
        ];
    }

    let hash = 0;
    if (orderId) {
        for (let i = 0; i < orderId.length; i++) {
            hash += orderId.charCodeAt(i);
        }
    } else {
        hash = Math.floor(Math.random() * quotes.length);
    }
    return quotes[hash % quotes.length];
}

function centerText24(text) {
    const width = 24;
    if (text.length <= width) {
        const leftPad = Math.floor((width - text.length) / 2);
        return ' '.repeat(leftPad) + text;
    }
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    words.forEach(word => {
        if ((currentLine + (currentLine ? ' ' : '') + word).length <= width) {
            currentLine += (currentLine ? ' ' : '') + word;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    });
    if (currentLine) lines.push(currentLine);
    return lines.map(line => {
        const leftPad = Math.floor((width - line.length) / 2);
        return ' '.repeat(leftPad) + line;
    }).join('\n');
}

function formatRow24(col1, col2, col3) {
    const w1 = 13;
    const w2 = 4;
    const w3 = 7;
    let c1 = col1.slice(0, w1 - 1);
    c1 = c1.padEnd(w1, ' ');
    const c2 = col2.toString().padStart(w2, ' ');
    const c3 = col3.toString().padStart(w3, ' ');
    return c1 + c2 + c3;
}

function formatDouble24(label, value) {
    const totalWidth = 24;
    const valStr = value.toString();
    const padSize = totalWidth - label.length;
    if (padSize < valStr.length) {
        return label.slice(0, totalWidth - valStr.length) + valStr;
    }
    return label + valStr.padStart(padSize, ' ');
}

function formatReceiptText(record, profile = businessProfile, currSymbol = 'Rs.') {
    const borderDouble = '='.repeat(24);
    const borderSingle = '-'.repeat(24);
    
    let msg = "```\n";
    msg += borderDouble + '\n';
    msg += centerText24(profile.name) + '\n';
    msg += centerText24(profile.address) + '\n';
    msg += centerText24(profile.phone) + '\n';
    msg += borderDouble + '\n\n';
    
    const billLine = `Bill: ${record.orderId}`;
    const payLine = record.paymentMethod || 'Cash';
    const padSize = 24 - billLine.length;
    if (padSize >= payLine.length) {
        // Bill number short enough — payment fits on same line
        msg += billLine + payLine.padStart(padSize, ' ') + '\n';
    } else {
        // Bill number too long — put each on its own line, no truncation
        msg += billLine + '\n';
        msg += `Paid: ${payLine}` + '\n';
    }
    
    const dateOnly = record.dateTime ? record.dateTime.split(',')[0] : new Date().toLocaleDateString('en-IN');
    msg += `Date: ${dateOnly}\n`;
    msg += `Guest: ${(record.customerName || 'Walk-in Guest').slice(0, 17)}\n\n`;
    
    msg += borderSingle + '\n';
    msg += formatRow24('Item', 'Qty', 'Amt') + '\n';
    msg += borderSingle + '\n';
    
    let items = [];
    try {
        items = typeof record.items === 'string' ? JSON.parse(record.items) : record.items;
    } catch (e) {
        items = [];
    }

    if (Array.isArray(items)) {
        items.forEach(item => {
            const itemIcon = item.icon || getFallbackCategoryIcon(item.category || item.name);
            let displayName = `${itemIcon} ${item.name}`;
            if (item.size && item.size !== 'Small') {
                displayName += ` (${item.size.charAt(0)})`;
            }
            msg += formatRow24(displayName, item.qty, (item.price * item.qty).toString()) + '\n';
            msg += `  (${currSymbol}${item.price} each)\n`;
            if (item.toppings && item.toppings.length > 0) {
                msg += `  + ${item.toppings.join(', ')}\n`;
            }
            if (item.notes) {
                msg += `  * Note: ${item.notes}\n`;
            }
        });
    }
    
    msg += borderSingle + '\n';
    msg += formatDouble24('Subtotal', `${currSymbol}${record.subtotal}`) + '\n';
    
    if (profile.gstEnabled !== false) {
        msg += formatDouble24('GST', `${currSymbol}${record.gst}`) + '\n';
    }
    
    if (record.discount && record.discount > 0) {
        msg += formatDouble24('Discount', `-${currSymbol}${record.discount}`) + '\n';
    }
    
    msg += borderDouble + '\n';
    msg += formatDouble24('GRAND TOTAL', `${currSymbol}${record.total}`) + '\n';
    msg += borderDouble + '\n\n';

    const vibeQuote = getRandomGoodVibeQuote(record);
    msg += borderSingle + '\n';
    msg += centerText24(vibeQuote) + '\n';
    msg += borderSingle + '\n\n';
    
    msg += centerText24('Thank you for visiting!') + '\n';
    msg += centerText24('Visit Again ☕') + '\n';
    msg += "```";
    return msg;
}

// ============================================================
// ============================================================
// DEBUG RELAY ENDPOINT — to check relay URL format safely
// ============================================================
app.get('/debug-relay', (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const relay = process.env.EMAIL_RELAY_URL || emailConfig.relayUrl || '';
    if (!relay) {
        return res.json({ configured: false, error: 'Relay URL is empty' });
    }
    res.json({
        configured: true,
        length: relay.length,
        prefix: relay.substring(0, 40),
        suffix: relay.substring(Math.max(0, relay.length - 15)),
        containsMacros: relay.includes('/macros/s/'),
        containsExec: relay.endsWith('/exec'),
        containsEdit: relay.includes('/edit')
    });
});

// GET Endpoint to read recent DB health logs bypassing RLS
app.get('/debug-logs', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId || 'system';
    try {
        if (!supabaseService) {
            // Return local memory logs filtered securely by tenantId
            let filtered = recentHealthEvents;
            if (tenantId && tenantId !== 'system') {
                filtered = recentHealthEvents.filter(e => e.details && e.details.tenant_id === tenantId);
            }
            return res.json({ status: 'success', logs: filtered });
        }
        let query = supabaseService
            .from('gateway_health_log')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);
            
        if (tenantId && tenantId !== 'system') {
            // Filter strictly for this tenant inside the details JSONB object
            query = query.eq('details->>tenant_id', tenantId);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        return res.json({ status: 'success', logs: data });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

// GET Endpoint to inspect session storage bucket settings
app.get('/debug-bucket', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    try {
        if (!supabaseService) {
            return res.json({ status: 'error', reason: 'SUPABASE_SERVICE_KEY not set' });
        }
        const { data: bucket, error: bucketErr } = await supabaseService.storage.getBucket(SESSION_BUCKET);
        if (bucketErr) throw bucketErr;
        const { data: files, error: filesErr } = await supabaseService.storage.from(SESSION_BUCKET).list();
        return res.json({
            status: 'success',
            bucket,
            files: files || [],
            filesErr: filesErr ? filesErr.message : null
        });
    } catch (err) {
        return res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/test-relay-call', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }
    const relay = process.env.EMAIL_RELAY_URL || emailConfig.relayUrl || '';
    if (!relay) return res.json({ error: 'No relay configured' });
    
    const https = require('https');
    const url = new URL(relay);
    const postData = JSON.stringify({
        to: 'csheoganj@gmail.com',
        subject: 'Test Ping',
        html: '<p>Ping</p>'
    });
    
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
    };
    
    const request = https.request(url, options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
            res.json({
                statusCode: response.statusCode,
                headers: response.headers,
                body: body
            });
        });
    });
    request.on('error', err => res.json({ error: err.message }));
    request.write(postData);
    request.end();
});

// HEALTH ENDPOINT — for UptimeRobot / external monitors
// ============================================================
app.get('/health', (req, res) => {
    const systemData = tenantClients.get('system') || { status: 'disconnected' };
    res.json({
        ok: true,
        status: systemData.status,
        uptime: Math.floor(process.uptime()),
        time: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log('\n======================================================');
    console.log(` RestroSuite WhatsApp Gateway running at:`);
    console.log(` http://localhost:${PORT}`);
    console.log('======================================================');
    try {
        const commitHash = require('child_process').execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        console.log(`[Startup] Code version commit: ${commitHash}`);
    } catch (err) {
        console.log(`[Startup] Code version commit lookup failed (git not installed or no repo).`);
    }

    // Ensure storage bucket exists and limits are set correctly (150MB) to allow session backup
    if (supabaseService) {
        try {
            console.log('[Startup] Ensuring storage bucket exists and limits are set correctly...');
            const bucketTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
            
            const runSetup = async () => {
                const { data: buckets, error: listError } = await supabaseService.storage.listBuckets();
                if (listError) throw listError;
                const exists = buckets && buckets.some(b => b.name === SESSION_BUCKET);
                if (!exists) {
                    console.log(`[Startup] Bucket '${SESSION_BUCKET}' not found. Creating it...`);
                    const { error: createError } = await supabaseService.storage.createBucket(SESSION_BUCKET, {
                        public: false,
                        fileSizeLimit: 10485760, // 10MB
                        allowedMimeTypes: ['application/zip']
                    });
                    if (createError) throw createError;
                    console.log(`[Startup] Bucket '${SESSION_BUCKET}' created successfully.`);
                } else {
                    const { error: updateError } = await supabaseService.storage.updateBucket(SESSION_BUCKET, {
                        public: false,
                        fileSizeLimit: 10485760 // 10MB
                    });
                    if (updateError) throw updateError;
                    console.log(`[Startup] Bucket '${SESSION_BUCKET}' updated successfully.`);
                }
            };

            await Promise.race([
                runSetup(),
                bucketTimeout
            ]);
            console.log('[Startup] Storage bucket configured.');
        } catch (err) {
            console.warn('[Startup Storage Config Warning]', err.message === 'timeout' ? 'Bucket setup timed out — skipping.' : err.message);
        }
    }

    try {
        const healthTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
        await Promise.race([logHealthEvent('startup', 'ok', { port: PORT, platform: os.platform() }), healthTimeout]);
    } catch (err) {
        console.warn('[Startup Health Log Warning] Skipped:', err.message);
    }

    // Clean up any stale lock/socket/cookie files from a previous run first
    console.log('[Startup] Cleaning up any stale browser lock/socket/cookie files...');
    cleanupStaleLockFiles(authDataPath);

    // Attempt to restore WhatsApp sessions from Supabase Storage
    console.log('[Startup] Attempting to restore WhatsApp sessions from Supabase Storage...');
    try {
        const restoreTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000));
        await Promise.race([restoreSessionsFromSupabase(), restoreTimeout]);
    } catch (err) {
        console.warn('[Startup Session Restore Warning] Timed out or failed:', err.message);
    }

    // Send startup alert email (informational only)
    try {
        const alertTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
        await Promise.race([sendAdminAlert('startup', { sessionRestored: true }), alertTimeout]);
    } catch (err) {
        console.warn('[Startup Alert Warning] Skipped:', err.message);
    }

    console.log('[Startup] Initializing WhatsApp drivers...');
    try {
        console.log('[Startup Init Shield] Cleaning up stale browser lock/socket/cookie files immediately before launch...');
        cleanupStaleLockFiles(authDataPath);
    } catch (err) {
        console.error('[Startup Init Shield Error]', err.message);
    }

    // Initialize SuperAdmin / system client
    getOrCreateClient('system');
    
    // Auto-initialize other tenant clients that have local sessions
    autoInitializeLocalSessions();

    // Start database notification polling fallback (every 60 seconds)
    if (supabaseService) {
        console.log('[Startup] Starting database notification polling fallback...');
        setTimeout(runNotificationPollingFallback, 5000); // Initial run in 5s
        setInterval(runNotificationPollingFallback, 60000); // Run every 60s
    }

    // ============================================================
    // KEEP-ALIVE SELF-PING — prevents HuggingFace Space from sleeping
    // Pings own /health endpoint every 4 minutes so the space stays
    // warm 24/7 even on the free tier.
    // ============================================================
    const selfUrl = process.env.SPACE_HOST
        ? `https://${process.env.SPACE_HOST}/health`
        : `http://localhost:3000/health`;
    setInterval(() => {
        const client = selfUrl.startsWith('https') ? require('https') : require('http');
        client.get(selfUrl, (r) => {
            console.log(`[Keep-Alive] Pinged ${selfUrl}`);
        }).on('error', () => {});
    }, 4 * 60 * 1000);
});
