import os

file_path = r"c:\Users\MASTER PC\Downloads\restrosuite\whatsapp-gateway.js"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace autoInitializeLocalSessions function definition
old_fn = """function autoInitializeLocalSessions() {
    // Intentionally disabled: lazy initialization prevents HF from pausing the Space.
    // Tenants reconnect automatically when their first API request arrives.
    console.log('[Lazy Init] Session auto-restore is disabled. Clients connect on first request.');
}"""

new_fn = """function autoInitializeLocalSessions() {
    console.log('[Startup Auto-Connect] Restoring all WhatsApp sessions on server boot...');
    const authDir = path.join(os.homedir(), '.restrosuite', 'whatsapp-auth');
    if (!fs.existsSync(authDir)) {
        console.log('[Startup Auto-Connect] No local session directory found.');
        return;
    }
    
    try {
        const folders = fs.readdirSync(authDir);
        let count = 0;
        for (const folder of folders) {
            if (folder.startsWith('session-')) {
                const tenantId = folder.substring(8);
                console.log(`[Startup Auto-Connect] Auto-connecting WhatsApp for tenant: ${tenantId}`);
                const tenantData = getOrCreateClient(tenantId);
                initializeBaileysClient(tenantId, tenantData).catch(err => {
                    console.error(`[Startup Auto-Connect Error] Tenant ${tenantId}:`, err.message);
                });
                count++;
            }
        }
        console.log(`[Startup Auto-Connect] Triggered connection for ${count} WhatsApp session(s).`);
    } catch (err) {
        console.error('[Startup Auto-Connect Error] Failed to read auth directory:', err.message);
    }
}"""

if old_fn in content:
    content = content.replace(old_fn, new_fn)
    print("[SUCCESS] autoInitializeLocalSessions function successfully updated.")
else:
    print("[ERROR] Failed to match autoInitializeLocalSessions in script.")

# 2. Update startup log messages at the bottom of the file
old_startup = """    // LAZY INIT: Do NOT auto-connect WhatsApp on startup.
    // HuggingFace flags spaces that open outgoing WebSocket connections during boot.
    // Connections are established on-demand when a tenant first makes an API request.
    console.log('[Startup] Lazy init mode: WhatsApp connections will be established on first request.');
    console.log('[Startup] Server is ready. Waiting for tenant requests to initialize WhatsApp...');
    autoInitializeLocalSessions(); // No-op in lazy mode — just logs"""

new_startup = """    // Startup Auto-Connect: Automatically connect all saved sessions on boot
    console.log('[Startup] Restoring saved WhatsApp connections...');
    autoInitializeLocalSessions();
    console.log('[Startup] Server is ready. Active connections are syncing in the background...');"""

if old_startup in content:
    content = content.replace(old_startup, new_startup)
    print("[SUCCESS] Startup logs and calls successfully updated.")
else:
    print("[ERROR] Failed to match startup block at bottom of script.")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("[FILE] whatsapp-gateway.js saved successfully.")
