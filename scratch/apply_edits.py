import os

file_path = r"c:\Users\MASTER PC\Downloads\restrosuite\whatsapp-gateway.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace /send block
old_send_block = """    try {
        const chatId = `${phone}@c.us`;
        
        if (pdfData) {
            const media = {
                document: Buffer.from(pdfData, 'base64'),
                mimetype: 'application/pdf',
                fileName: filename || 'receipt.pdf'
            };
            await humanSend(tenantData.client, chatId, media, {}, tenantId);
            // Do NOT send a separate text after the PDF -- the PDF IS the receipt.
        } else {
            // Send monospaced text receipt
            await humanSend(tenantData.client, chatId, message, {}, tenantId);
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
        if (orderId && supabase) {
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
        if (orderId && supabase) {
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
    }"""

new_send_block = """    try {
        const chatId = `${phone}@c.us`;
        
        // 1. Send text confirmation immediately
        if (message) {
            await humanSend(tenantData.client, chatId, message, {}, tenantId);
        } else if (pdfData) {
            await humanSend(tenantData.client, chatId, "Generating your receipt PDF...", {}, tenantId);
        }

        // 2. Respond to the client immediately
        res.json({ status: 'success', message: 'Message sending initiated' });

        // 3. Mark this order as handled so the realtime listener doesn't double-send
        if (orderId) {
            const skipKey = `${tenantId}:${orderId}`;
            realtimeSkipOrders.add(skipKey);
            setTimeout(() => realtimeSkipOrders.delete(skipKey), 60000);
        }

        // 4. Send PDF asynchronously in the background
        if (pdfData) {
            (async () => {
                const media = {
                    document: Buffer.from(pdfData, 'base64'),
                    mimetype: 'application/pdf',
                    fileName: filename || 'receipt.pdf'
                };
                await humanSend(tenantData.client, chatId, media, {}, tenantId);
                console.log(`[Manual Sent] WhatsApp receipt successfully delivered for tenant ${tenantId} to: +${maskPhone(phone)}`);
                
                await logHealthEvent('send_receipt', 'ok', {
                    tenant_id: tenantId,
                    phone: maskPhone(phone),
                    orderId: orderId,
                    message: `Receipt PDF for tenant ${tenantId} successfully sent to +${maskPhone(phone)}`
                });

                if (orderId && supabase) {
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
            })().catch(async (err) => {
                console.error(`[Background Error] Failed to send receipt PDF for tenant ${tenantId} to +${maskPhone(phone)}:`, err.message);
                await logHealthEvent('send_receipt', 'error', {
                    tenant_id: tenantId,
                    phone: maskPhone(phone),
                    orderId: orderId,
                    error: err.message,
                    message: `Failed to send receipt PDF for tenant ${tenantId} to +${maskPhone(phone)}: ${err.message}`
                });

                if (orderId && supabase) {
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
            });
        } else {
            // Text only message sent successfully, log it now
            await logHealthEvent('send_receipt', 'ok', {
                tenant_id: tenantId,
                phone: maskPhone(phone),
                orderId: orderId,
                message: `Receipt text for tenant ${tenantId} successfully sent to +${maskPhone(phone)}`
            });
        }
    } catch (err) {
        console.error(`[Manual Error] Failed to send receipt for tenant ${tenantId} to +${maskPhone(phone)}:`, err.message);

        await logHealthEvent('send_receipt', 'error', {
            tenant_id: tenantId,
            phone: maskPhone(phone),
            orderId: orderId,
            error: err.message,
            message: `Failed to send receipt for tenant ${tenantId} to +${maskPhone(phone)}: ${err.message}`
        });
        
        if (orderId && supabase) {
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
        if (!res.headersSent) {
            res.status(500).json({ status: 'error', error: err.message });
        }
    }"""

if old_send_block in content:
    content = content.replace(old_send_block, new_send_block)
    print("[SUCCESS] /send API endpoint successfully updated to background mode.")
else:
    print("[ERROR] Failed to match /send API endpoint in script.")

# 2. Precise replaces for health logs
health_replacements = [
    # qr_generated
    (
        "await logHealthEvent('qr_generated', 'warning', { tenantId: tid });",
        "await logHealthEvent('qr_generated', 'warning', { tenantId: tid, message: `QR code generated for tenant: ${tid}` });"
    ),
    # reconnect_failed
    (
        "await logHealthEvent('reconnect_failed', 'error', { tenantId: tid, attempts: tenantData.reconnectAttempts });",
        "await logHealthEvent('reconnect_failed', 'error', { tenantId: tid, attempts: tenantData.reconnectAttempts, message: `Reconnect failed for tenant ${tid} after ${tenantData.reconnectAttempts} attempts` });"
    ),
    # connected
    (
        "await logHealthEvent('connected', 'ok', { tenantId: tid, number: tenantData.number });",
        "await logHealthEvent('connected', 'ok', { tenantId: tid, number: tenantData.number, message: `WhatsApp connected for tenant ${tid} as +${tenantData.number}` });"
    ),
    # session_saved
    (
        "await logHealthEvent('session_saved', 'ok', { path: fileName, size: zipBuffer.length });",
        "await logHealthEvent('session_saved', 'ok', { path: fileName, size: zipBuffer.length, message: `Session backup saved for tenant ${tenantId} (${(zipBuffer.length / 1024).toFixed(1)} KB)` });"
    ),
    # session_save_failed
    (
        "await logHealthEvent('session_save_failed', 'error', { error: err.message, zipSize: sizeMb });",
        "await logHealthEvent('session_save_failed', 'error', { error: err.message, zipSize: sizeMb, message: `Failed to save session for tenant ${tenantId}: ${err.message} (size: ${sizeMb})` });"
    )
]

for old_log, new_log in health_replacements:
    if old_log in content:
        content = content.replace(old_log, new_log)
        print(f"[SUCCESS] Replaced health log: {old_log.split('(')[1].split(',')[0]}")
    else:
        print(f"[WARNING] Health log not found: {old_log.split('(')[1].split(',')[0]}")

# 3. Handle disconnected log fuzzy replacement precisely
old_disconnected = """                await logHealthEvent('disconnected', shouldReconnect ? 'warning' : 'error', { 
                    tenantId: tid, 
                    reason: lastDisconnect?.error?.message 
                });"""

new_disconnected = """                await logHealthEvent('disconnected', shouldReconnect ? 'warning' : 'error', { 
                    tenantId: tid, 
                    reason: lastDisconnect?.error?.message,
                    message: `Connection closed for tenant ${tid}: ${lastDisconnect?.error?.message || 'Connection Failure'}`
                });"""

if old_disconnected in content:
    content = content.replace(old_disconnected, new_disconnected)
    print("[SUCCESS] Replaced health log: disconnected")
else:
    # Try with single line formatting
    old_disconnected_alt = """                await logHealthEvent('disconnected', shouldReconnect ? 'warning' : 'error', { tenantId: tid, reason: lastDisconnect?.error?.message });"""
    if old_disconnected_alt in content:
        content = content.replace(old_disconnected_alt, new_disconnected)
        print("[SUCCESS] Replaced health log: disconnected (alt)")
    else:
        print("[WARNING] Health log not found: disconnected")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("[FILE] whatsapp-gateway.js saved successfully.")
