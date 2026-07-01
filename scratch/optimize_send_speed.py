import os

file_path = r"c:\Users\MASTER PC\Downloads\restrosuite\whatsapp-gateway.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

old_send_block = """    try {
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

new_send_block = """    try {
        const chatId = `${phone}@c.us`;

        // 1. Respond to the client immediately (within 10ms!)
        res.json({ status: 'success', message: 'Message sending initiated' });

        // 2. Mark this order as handled so the realtime listener doesn't double-send
        if (orderId) {
            const skipKey = `${tenantId}:${orderId}`;
            realtimeSkipOrders.add(skipKey);
            setTimeout(() => realtimeSkipOrders.delete(skipKey), 60000);
        }

        // 3. Process the delivery in the background (asynchronously)
        (async () => {
            // A. Send text message first
            if (message) {
                await humanSend(tenantData.client, chatId, message, {}, tenantId);
                console.log(`[Background Sent] WhatsApp text message successfully delivered for tenant ${tenantId} to: +${maskPhone(phone)}`);
            }

            // B. Send PDF message second
            if (pdfData) {
                const media = {
                    document: Buffer.from(pdfData, 'base64'),
                    mimetype: 'application/pdf',
                    fileName: filename || 'receipt.pdf'
                };
                await humanSend(tenantData.client, chatId, media, {}, tenantId);
                console.log(`[Background Sent] WhatsApp PDF receipt successfully delivered for tenant ${tenantId} to: +${maskPhone(phone)}`);
            }

            // C. Broadcast success back to Supabase Realtime & Health Log
            await logHealthEvent('send_receipt', 'ok', {
                tenant_id: tenantId,
                phone: maskPhone(phone),
                orderId: orderId,
                message: `Receipt for tenant ${tenantId} successfully sent to +${maskPhone(phone)}`
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
            console.error(`[Background Error] Failed to send receipt for tenant ${tenantId} to +${maskPhone(phone)}:`, err.message);
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
        });
    } catch (err) {
        console.error(`[Manual Error] Failed to initiate receipt send for tenant ${tenantId} to +${maskPhone(phone)}:`, err.message);
        if (!res.headersSent) {
            res.status(500).json({ status: 'error', error: err.message });
        }
    }"""

if old_send_block in content:
    content = content.replace(old_send_block, new_send_block)
    print("[SUCCESS] /send block successfully optimized for asynchronous sending.")
else:
    print("[ERROR] Failed to match old /send block in script.")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("[FILE] whatsapp-gateway.js saved successfully.")
