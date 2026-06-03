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

const app = express();

// Enable CORS for POS dashboard requests
app.use(cors());
app.use(express.json());

// Gateway connection state variables
let connectionStatus = 'connecting'; // 'connecting', 'qr', 'ready', 'disconnected', 'auth_failure'
let qrCodeDataUrl = null;
let linkedNumber = null;

const os = require('os');
const path = require('path');

// Determine data path dynamically to support both Windows local execution and Linux cloud containers
let authDataPath = path.join(__dirname, '.wwebjs_auth');
if (os.platform() === 'win32') {
    authDataPath = 'C:\\Users\\KALPESH DEORA\\.gemini\\antigravity\\doppio-auth';
}

// Initialize WhatsApp client with local session caching
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authDataPath
    }),
    puppeteer: {
        handleSIGINT: false,
        protocolTimeout: 0,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
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

// GET Endpoint to read current gateway connection state
app.get('/status', (req, res) => {
    res.json({
        status: connectionStatus,
        authenticated: connectionStatus === 'ready',
        number: linkedNumber,
        qr: qrCodeDataUrl
    });
});

// POST Endpoint to log out / unlink the device
app.post('/logout', async (req, res) => {
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
        
        console.log(`[Manual Sent] WhatsApp receipt successfully delivered to: +${phone}`);
        
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
        console.error(`[Manual Error] Failed to send receipt to +${phone}:`, err.message);
        
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
        console.log(`[Webhook Auto-Sent] WhatsApp receipt successfully delivered to: +${phone} for order ${orderId}`);
        
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

// ======================================================
// NATIVE SUPABASE REALTIME DB INSERT LISTENER
// ======================================================
const realtimeChannel = supabase
    .channel('doppio-bills-realtime-listener')
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

            console.log(`[Realtime Triggered] Detected new bill insert in cloud db: ${orderId}`);

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
                
                // Format monospace receipt
                const message = formatReceiptText(record);
                
                // Dispatch message via Whatsapp
                if (connectionStatus === 'ready') {
                    await client.sendMessage(chatId, message);
                    console.log(`[Realtime Auto-Sent] WhatsApp receipt successfully delivered to: +${phone} for order ${orderId}`);
                    
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

function formatReceiptText(record) {
    const borderDouble = '='.repeat(24);
    const borderSingle = '-'.repeat(24);
    
    let msg = "```\n";
    msg += borderDouble + '\n';
    msg += centerText24(businessProfile.name) + '\n';
    msg += centerText24(businessProfile.address) + '\n';
    msg += centerText24(businessProfile.phone) + '\n';
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
    
    if (businessProfile.gstEnabled !== false) {
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
