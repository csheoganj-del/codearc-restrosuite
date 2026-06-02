const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client for Realtime Broadcast integration
const SUPABASE_URL = 'https://htkauiibuejetimfiavs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();

// Enable CORS for POS dashboard requests
app.use(cors());
app.use(express.json());

// Initialize WhatsApp client with local session caching
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
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

// Display QR code in terminal for account linking
client.on('qr', (qr) => {
    console.log('\n==================================================================');
    console.log('   SCAN THIS QR CODE WITH YOUR WHATSAPP APP TO LINK YOUR ACCOUNT   ');
    console.log('==================================================================\n');
    qrcode.generate(qr, { small: true });
    console.log('\nInstructions: Open WhatsApp > Settings > Linked Devices > Link a Device.');
});

client.on('ready', () => {
    console.log('\n======================================================');
    console.log('   SUCCESS: Free WhatsApp Gateway is Ready & Linked!  ');
    console.log('======================================================\n');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failure:', msg);
});

client.on('disconnected', (reason) => {
    console.log('WhatsApp client was disconnected:', reason);
});

// HTTP API Endpoint to send receipts in the background
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
        
        console.log(`[Sent] WhatsApp receipt successfully delivered to: +${phone}`);
        
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
        console.error(`[Error] Failed to send receipt to +${phone}:`, err.message);
        
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log('\n======================================================');
    console.log(` Free Local WhatsApp Gateway running at:`);
    console.log(` http://localhost:${PORT}`);
    console.log('======================================================');
    console.log('Initializing WhatsApp driver... Please wait for QR code.');
    client.initialize().catch(err => console.error('Failed to initialize client:', err));
});
