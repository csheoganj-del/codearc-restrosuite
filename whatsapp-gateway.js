const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCodeLib = require('qrcode');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

// Initialize Supabase Client for Realtime Broadcast integration
const SUPABASE_URL = 'https://htkauiibuejetimfiavs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: {
        transport: ws
    }
});

// Configure Nodemailer for Free Gmail SMTP sending (Made by Antigravity)
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

let emailConfig = {
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_APP_PASSWORD || '',
    fromName: process.env.FROM_NAME || 'CodeArc RestoSuite'
};

const configPath = path.join(__dirname, 'email-config.json');
if (!emailConfig.user && fs.existsSync(configPath)) {
    try {
        const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        emailConfig.user = fileConfig.gmail_user || '';
        emailConfig.pass = fileConfig.gmail_app_password || '';
        emailConfig.fromName = fileConfig.from_name || 'CodeArc RestoSuite';
    } catch (err) {
        console.error("Failed to parse local email-config.json:", err.message);
    }
}

let transporter = null;
if (emailConfig.user && emailConfig.pass) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: emailConfig.user,
            pass: emailConfig.pass
        }
    });
    console.log(`[SMTP] Nodemailer configured to send as: ${emailConfig.user}`);
} else {
    console.log('[SMTP Warning] GMAIL_USER and GMAIL_APP_PASSWORD not set. Email notifications will be disabled.');
}

const app = express();

// Enable CORS for POS dashboard requests
app.use(cors());
app.use(express.json());

// Gateway connection state variables
let connectionStatus = 'connecting'; // 'connecting', 'qr', 'ready', 'disconnected', 'auth_failure'
let qrCodeDataUrl = null;
let linkedNumber = null;

// Read secret token from environment variable (configured as a secret in HuggingFace Space)
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

// Utility to mask phone numbers in logs to prevent customer data leaks
function maskPhone(phoneStr) {
    if (!phoneStr) return null;
    const clean = phoneStr.replace(/\D/g, '');
    if (clean.length <= 4) return '****';
    return clean.substring(0, 2) + '*'.repeat(clean.length - 6) + clean.substring(clean.length - 4);
}

// Token validation helper
function verifyToken(req) {
    if (!GATEWAY_TOKEN) return true; // If no token is set in environment, allow request by default (convenient for local dev)
    
    const authHeader = req.headers['authorization'];
    const xToken = req.headers['x-gateway-token'];
    let token = xToken;
    
    if (!token && authHeader) {
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else {
            token = authHeader;
        }
    }
    
    return token === GATEWAY_TOKEN;
}

const os = require('os');

// Determine data path dynamically to support both Windows local execution and Linux cloud containers
let authDataPath = path.join(__dirname, '.wwebjs_auth');
if (os.platform() === 'win32') {
    authDataPath = path.join(os.homedir(), '.gemini', 'antigravity', 'doppio-auth');
}

// Initialize WhatsApp client with local session caching
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authDataPath
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    },
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
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        ]
    }
});

// Display QR code in terminal and save base64 data URI for POS Web UI
client.on('qr', async (qr) => {
    connectionStatus = 'qr';
    linkedNumber = null;
    try {
        qrCodeDataUrl = await QRCodeLib.toDataURL(qr);
        console.log('\n==================================================================');
        console.log('   SCAN THIS QR CODE WITH YOUR WHATSAPP APP TO LINK YOUR ACCOUNT   ');
        console.log('==================================================================\n');
        qrcode.generate(qr, { small: true });
        console.log('\nInstructions: Open WhatsApp > Settings > Linked Devices > Link a Device.');
        console.log('Alternative: Open POS Admin settings to scan directly from the browser.');
    } catch (err) {
        console.error('Failed to generate base64 QR Code URL:', err);
    }
});

client.on('ready', () => {
    connectionStatus = 'ready';
    qrCodeDataUrl = null;
    linkedNumber = client.info?.wid?.user || 'Unknown Device';
    console.log('\n======================================================');
    console.log(`   SUCCESS: Free WhatsApp Gateway is Ready & Linked!  `);
    console.log(`   Connected Account: +${linkedNumber}`);
    console.log('======================================================\n');
});

client.on('auth_failure', (msg) => {
    connectionStatus = 'auth_failure';
    qrCodeDataUrl = null;
    linkedNumber = null;
    console.error('Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
    connectionStatus = 'disconnected';
    qrCodeDataUrl = null;
    linkedNumber = null;
    console.log('WhatsApp client was disconnected:', reason);
});

// GET Endpoint to serve visual Gateway Dashboard for CodeArc Administrators (Made by Antigravity)
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeArc RestoSuite - WhatsApp Master Gateway</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --accent: #C98A4A;
            --accent-hover: #b0733a;
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
            <h1>CodeArc RestoSuite</h1>
            <p class="subtitle">Platform Master WhatsApp & Email Gateway</p>
        </div>

        <div class="status-card" id="status-card">
            <div class="spinner"></div>
            <p>Initializing connection status...</p>
        </div>

        <div id="action-container" style="display: none;">
            <button class="btn btn-danger" id="logout-btn"><i class="fa-solid fa-link-slash"></i> Unlink WhatsApp Account</button>
        </div>

        <div class="footer">
            Platform Gateway &copy; 2026 CodeArc. Support: <a href="mailto:hello@codearc.co.in">hello@codearc.co.in</a>
        </div>
    </div>

    <script>
        const statusCard = document.getElementById('status-card');
        const actionContainer = document.getElementById('action-container');
        const logoutBtn = document.getElementById('logout-btn');
        let checkInterval = null;

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
                
                renderState(data.status, data.qr, data.number, data.secured);
            } catch (err) {
                console.error("Failed to query gateway status:", err);
                statusCard.innerHTML = \`
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 40px; color: var(--danger); margin-bottom:16px;"></i>
                    <p>Gateway server connection offline.</p>
                \`;
                actionContainer.style.display = 'none';
            }
        }

        function renderState(status, qr, number, secured) {
            let statusText = status.toUpperCase();
            let statusClass = status;

            let badgeHtml = \`<span class="status-badge \${statusClass}"><i class="fa-solid fa-circle"></i> \${statusText}</span>\`;
            let contentHtml = '';
            
            if (status === 'ready') {
                contentHtml = \`
                    \${badgeHtml}
                    <i class="fa-solid fa-circle-check success-icon"></i>
                    <p class="details-text">CodeArc WhatsApp is fully linked and active.</p>
                    <p class="details-text">Active Number: <span class="number-highlight">+\${number || 'Unknown'}</span></p>
\`;
                actionContainer.style.display = 'block';
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
                actionContainer.style.display = 'none';
            } else if (status === 'connecting') {
                contentHtml = \`
                    \${badgeHtml}
                    <div class="spinner"></div>
                    <p class="details-text">Establishing connection with WhatsApp Web drivers...</p>
\`;
                actionContainer.style.display = 'none';
            } else {
                contentHtml = \`
                    \${badgeHtml}
                    <i class="fa-solid fa-circle-xmark" style="font-size: 50px; color: var(--danger); margin-bottom: 16px;"></i>
                    <p class="details-text">Driver Status: <span style="font-weight: 600;">\${statusText}</span></p>
                    <p class="details-text" style="font-size: 12px; max-width: 280px;">Please check the server console logs for exact failure details.</p>
\`;
                actionContainer.style.display = 'none';
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

        updateStatus();
        checkInterval = setInterval(updateStatus, 2500);
        window.addEventListener('hashchange', updateStatus);
    </script>
</body>
</html>
    `);
});

// GET Endpoint to read current gateway connection state
app.get('/status', (req, res) => {
    const isAuthorized = verifyToken(req);
    
    if (isAuthorized) {
        res.json({
            status: connectionStatus,
            authenticated: connectionStatus === 'ready',
            number: linkedNumber,
            qr: qrCodeDataUrl
        });
    } else {
        // Return masked status to prevent data leaks or QR hijacking
        res.json({
            status: connectionStatus,
            authenticated: connectionStatus === 'ready',
            number: linkedNumber ? maskPhone(linkedNumber) : null,
            qr: null, // Hide QR code from public view
            secured: true
        });
    }
});

// POST Endpoint to log out / unlink the device
app.post('/logout', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }

    try {
        console.log('Request received to log out WhatsApp device...');
        if (connectionStatus === 'ready') {
            await client.logout();
        }
        connectionStatus = 'disconnected';
        qrCodeDataUrl = null;
        linkedNumber = null;
        console.log('WhatsApp device logged out successfully.');
        res.json({ status: 'success', message: 'Logged out successfully. Scan QR again.' });
    } catch (err) {
        console.error('Failed to log out device:', err);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// HTTP API Endpoint to send receipts manually in the background
app.post('/send', async (req, res) => {
    if (!verifyToken(req)) {
        return res.status(401).json({ status: 'error', error: 'Unauthorized: Invalid Gateway Token' });
    }

    let { orderId, phone, message } = req.body;
    
    if (!phone || !message) {
        return res.status(400).json({ status: 'error', error: 'Missing phone or message' });
    }

    // Clean phone number format
    phone = phone.replace(/\D/g, '');
    if (phone.length === 10) {
        phone = "91" + phone;
    }

    try {
        const chatId = `${phone}@c.us`;
        
        // Send monospaced text receipt
        await client.sendMessage(chatId, message);
        
        console.log(`[Manual Sent] WhatsApp receipt successfully delivered to: +${maskPhone(phone)}`);
        
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
        console.error(`[Manual Error] Failed to send receipt to +${maskPhone(phone)}:`, err.message);
        
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

    if (!transporter) {
        return res.status(503).json({ status: 'error', error: 'Email SMTP service is not configured on this gateway space.' });
    }

    const mailOptions = {
        from: `"${emailConfig.fromName}" <${emailConfig.user}>`,
        to: to,
        subject: subject,
        text: text,
        html: html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Email Sent] Message successfully delivered to: ${to} (MessageId: ${info.messageId})`);
        res.json({ status: 'success', messageId: info.messageId });
    } catch (err) {
        console.error(`[Email Error] Failed to send email to ${to}:`, err.message);
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// Legacy HTTP Webhook Receiver endpoint (retained for backward compatibility)
app.post('/supabase-webhook', async (req, res) => {
    const { type, table, record } = req.body;
    if (type !== 'INSERT' || table !== 'doppio_bills' || !record) {
        return res.status(400).json({ status: 'ignored', reason: 'Not an insert on public.doppio_bills' });
    }
    
    let phone = record.customerPhone;
    const orderId = record.orderId;

    if (!phone || phone.trim() === '' || phone === 'null') {
        console.log(`[Webhook] Ignored: No phone number provided for bill ${orderId}`);
        return res.json({ status: 'ignored', reason: 'No customer phone number' });
    }

    phone = phone.replace(/\D/g, '');
    if (phone.length === 10) {
        phone = "91" + phone;
    }

    try {
        const chatId = `${phone}@c.us`;
        const message = formatReceiptText(record);
        await client.sendMessage(chatId, message);
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

// Helper to send registration notification (WhatsApp + Email) (Made by Antigravity)
async function handleNewRegistrationNotification(record) {
    const { name, slug, outlet_type, email, phone, username } = record;
    
    // 1. Send WhatsApp Confirmation
    if (phone && connectionStatus === 'ready') {
        let targetPhone = phone.replace(/\D/g, '');
        if (targetPhone.length === 10) {
            targetPhone = "91" + targetPhone;
        }
        const chatId = `${targetPhone}@c.us`;
        const typeStr = (outlet_type || 'cafe').toUpperCase();
        const msgText = `🎉 *Registration Received - CodeArc RestoSuite*\n\nHello,\n\nThank you for registering your outlet *${name}* (${typeStr}) with CodeArc RestoSuite!\n\nYour registration details:\n• *Outlet ID (Slug):* ${slug}\n• *Admin Username:* ${username}\n• *Owner Email:* ${email || 'N/A'}\n• *WhatsApp Number:* ${phone}\n\n*Status:* ⏳ Pending Approval\n\nOur team at CodeArc is reviewing your request. You will receive another notification as soon as your account is approved and active.\n\nIf you have any questions, feel free to reply or contact us at:\n• 📧 Email: hello@codearc.co.in\n• 📞 Call: +91 99837 21179\n• 🌐 Web: codearc.co.in\n\nBest regards,\nCodeArc Operations Team`;
        
        try {
            await client.sendMessage(chatId, msgText);
            console.log(`[Realtime WhatsApp] Registration confirmation sent to +${maskPhone(targetPhone)}`);
        } catch (err) {
            console.error(`[Realtime WhatsApp Error] Failed to send registration confirmation to +${targetPhone}:`, err.message);
        }
    }

    // 2. Send Email Confirmation
    if (email && transporter) {
        const typeStr = (outlet_type || 'cafe').toUpperCase();
        const emailSubject = `Registration Received - CodeArc RestoSuite (Outlet: ${name})`;
        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; color: #333;">
          <h2 style="color: #0f172a; border-bottom: 2px solid #C98A4A; padding-bottom: 10px;">🎉 Registration Received</h2>
          <p>Hello,</p>
          <p>Thank you for registering your outlet <strong>${name}</strong> (${typeStr}) with <strong>CodeArc RestoSuite</strong>!</p>
          
          <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #C98A4A;">
            <h3 style="margin-top: 0; color: #0f172a; font-size: 14px;">Outlet Request Details:</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr><td style="padding: 4px 0; font-weight: bold; width: 150px;">Outlet ID (Slug):</td><td>${slug}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">Admin Username:</td><td>${username}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">Owner Email:</td><td>${email}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">WhatsApp Contact:</td><td>+${phone}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">Current Status:</td><td><span style="background: #fef3c7; color: #d97706; padding: 2px 8px; border-radius: 12px; font-weight: bold;">⏳ Pending Approval</span></td></tr>
            </table>
          </div>

          <p>Our operations team at CodeArc is currently reviewing your registration request. You will receive another notification on WhatsApp and email as soon as your account is approved and active.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">Need support? Contact us at:</p>
          <ul style="font-size: 12px; color: #666; padding-left: 20px; margin-top: 0;">
            <li>📧 Email: <a href="mailto:hello@codearc.co.in" style="color: #C98A4A; text-decoration: none;">hello@codearc.co.in</a></li>
            <li>📞 Call: +91 99837 21179</li>
            <li>🌐 Web: <a href="https://codearc.co.in" target="_blank" style="color: #C98A4A; text-decoration: none;">codearc.co.in</a></li>
          </ul>
          
          <p style="font-size: 11px; color: #999; margin-top: 20px; text-align: center;">This is an automated system notification from CodeArc RestoSuite.</p>
        </div>
        `;
        
        const mailOptions = {
            from: `"${emailConfig.fromName}" <${emailConfig.user}>`,
            to: email,
            subject: emailSubject,
            html: emailHtml
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`[Realtime Email] Registration confirmation email sent to ${email}`);
        } catch (err) {
            console.error(`[Realtime Email Error] Failed to send registration confirmation email to ${email}:`, err.message);
        }
    }
}

// Helper to send approval notification (WhatsApp + Email) (Made by Antigravity)
async function handleApprovalNotification(record) {
    const { name, slug, email, phone, username } = record;

    // 1. Send WhatsApp Approval Alert
    if (phone && connectionStatus === 'ready') {
        let targetPhone = phone.replace(/\D/g, '');
        if (targetPhone.length === 10) {
            targetPhone = "91" + targetPhone;
        }
        const chatId = `${targetPhone}@c.us`;
        const msgText = `🎉 *Account Approved & Active - CodeArc RestoSuite*\n\nHello,\n\nGreat news! Your registration request for *${name}* has been reviewed and APPROVED by CodeArc RestoSuite.\n\nYour account is now fully active!\n\n🔑 *Login Credentials:*\n• *Outlet ID (Slug):* ${slug}\n• *Admin Username:* ${username}\n\n*Portal Link:* https://codearc.co.in/portal (or your server login page)\n\nYou can now log in, configure your settings, menu, inventory, and staff to get started immediately!\n\nIf you need any support, feel free to contact us:\n• 📧 Email: hello@codearc.co.in\n• 📞 Call: +91 99837 21179\n\nWelcome to RestoSuite!\n\nBest regards,\nCodeArc Operations Team`;
        
        try {
            await client.sendMessage(chatId, msgText);
            console.log(`[Realtime WhatsApp] Account approval alert sent to +${maskPhone(targetPhone)}`);
        } catch (err) {
            console.error(`[Realtime WhatsApp Error] Failed to send account approval alert to +${targetPhone}:`, err.message);
        }
    }

    // 2. Send Email Approval Alert
    if (email && transporter) {
        const emailSubject = `Account Approved & Active - CodeArc RestoSuite (Outlet: ${name})`;
        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; color: #333;">
          <h2 style="color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">🎉 Account Approved & Active</h2>
          <p>Hello,</p>
          <p>Great news! Your registration request for <strong>${name}</strong> has been reviewed and <strong>APPROVED</strong> by the CodeArc Operations Team.</p>
          <p>Your account is now fully active and ready to use!</p>

          <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #22c55e;">
            <h3 style="margin-top: 0; color: #0f172a; font-size: 14px;">🔑 Your Login Credentials:</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr><td style="padding: 4px 0; font-weight: bold; width: 150px;">Outlet ID (Slug):</td><td>${slug}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">Admin Username:</td><td>${username}</td></tr>
            </table>
          </div>

          <p>You can access your store dashboard portal here:</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="https://codearc.co.in/portal" style="background: #22c55e; color: white; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">Access Login Portal</a>
          </div>

          <p>Please log in, review your settings, tax tables, custom menu configuration, and employee ledger to begin operations.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">If you have any questions or require launch support, contact us:</p>
          <ul style="font-size: 12px; color: #666; padding-left: 20px; margin-top: 0;">
            <li>📧 Email: <a href="mailto:hello@codearc.co.in" style="color: #22c55e; text-decoration: none;">hello@codearc.co.in</a></li>
            <li>📞 Call: +91 99837 21179</li>
          </ul>
          
          <p style="font-size: 11px; color: #999; margin-top: 20px; text-align: center;">Welcome to the CodeArc RestoSuite platform!</p>
        </div>
        `;

        const mailOptions = {
            from: `"${emailConfig.fromName}" <${emailConfig.user}>`,
            to: email,
            subject: emailSubject,
            html: emailHtml
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`[Realtime Email] Account approval email sent to ${email}`);
        } catch (err) {
            console.error(`[Realtime Email Error] Failed to send account approval email to ${email}:`, err.message);
        }
    }
}

// ======================================================
// NATIVE SUPABASE REALTIME DB LISTENERS
// ======================================================
const realtimeChannel = supabase
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

            if (!phone || phone.trim() === '' || phone === 'null') {
                console.log(`[Realtime Triggered] Ignored: No phone number provided for bill ${orderId}`);
                return;
            }

            phone = phone.replace(/\D/g, '');
            if (phone.length === 10) {
                phone = "91" + phone;
            }

            try {
                const chatId = `${phone}@c.us`;
                
                // Fetch dynamic business profile for this tenant
                let tenantProfile = { ...businessProfile };
                if (tenantId) {
                    const { data: profiles } = await supabase
                        .from('doppio_business_profile')
                        .select('*')
                        .eq('tenant_id', tenantId);
                    
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
                    }
                }

                // Format monospace receipt using dynamic profile
                const message = formatReceiptText(record, tenantProfile);
                
                // Dispatch message via Whatsapp
                if (connectionStatus === 'ready') {
                    await client.sendMessage(chatId, message);
                    console.log(`[Realtime Auto-Sent] WhatsApp receipt successfully delivered to: +${maskPhone(phone)} for order ${orderId}`);
                    
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
                    console.warn(`[Realtime Delay] WhatsApp gateway not connected (Status: ${connectionStatus}). Cannot dispatch message.`);
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
    name: 'DOPPIO CAFE NAGPUR',
    address: 'London Street, Nagpur',
    phone: '+91 91300 03177',
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
            "🍔 Made fresh to make you smile! ✨",
            "🍟 Hot, crispy & made with love!",
            "🥪 Your perfect bite is here! ✨",
            "✨ Hot snacks, warm smiles! 🥪",
            "🔥 Delicious food, great mood!"
        ];
    } else if (hasDrinks && !hasFood) {
        quotes = [
            "✨ Brewing happiness for you! ☕",
            "☕ Good coffee, great day ahead!",
            "💖 Espresso yourself and smile! ☕",
            "✨ Freshly roasted joy in a cup! ☕",
            "☕ Sip back, relax & enjoy!"
        ];
    } else {
        quotes = [
            "✨ Today is a beautiful day! 🌟",
            "🍀 Thank you for being awesome! 💖",
            "✨ Spread kindness like confetti! 🎉",
            "💖 You made our day brighter! ✨",
            "🍪 You're the cookie to our cup! ☕"
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

function formatReceiptText(record, profile = businessProfile) {
    const borderDouble = '='.repeat(24);
    const borderSingle = '-'.repeat(24);
    
    let msg = "```\n";
    msg += borderDouble + '\n';
    msg += centerText24(profile.name) + '\n';
    msg += centerText24(profile.address) + '\n';
    msg += centerText24(profile.phone) + '\n';
    msg += borderDouble + '\n\n';
    
    let leftBill = `Bill: ${record.orderId}`;
    let rightPay = record.paymentMethod || 'Cash';
    if (rightPay.length > 8) {
        rightPay = rightPay.slice(0, 8);
    }
    const padSize = 24 - leftBill.length;
    if (padSize < rightPay.length) {
        msg += leftBill.slice(0, 24 - rightPay.length) + rightPay + '\n';
    } else {
        msg += leftBill + rightPay.padStart(padSize, ' ') + '\n';
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
            msg += `  (₹${item.price} each)\n`;
            if (item.toppings && item.toppings.length > 0) {
                msg += `  + ${item.toppings.join(', ')}\n`;
            }
            if (item.notes) {
                msg += `  * Note: ${item.notes}\n`;
            }
        });
    }
    
    msg += borderSingle + '\n';
    msg += formatDouble24('Subtotal', record.subtotal.toString()) + '\n';
    
    if (profile.gstEnabled !== false) {
        msg += formatDouble24('GST', record.gst.toString()) + '\n';
    }
    
    if (record.discount && record.discount > 0) {
        msg += formatDouble24('Discount', `-${record.discount}`) + '\n';
    }
    
    msg += borderDouble + '\n';
    msg += formatDouble24('GRAND TOTAL', record.total.toString()) + '\n';
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('\n======================================================');
    console.log(` Free Local WhatsApp Gateway running at:`);
    console.log(` http://localhost:${PORT}`);
    console.log('======================================================');
    console.log('Initializing WhatsApp driver... Please wait for QR code.');
    client.initialize().catch(err => console.error('Failed to initialize client:', err));
});
