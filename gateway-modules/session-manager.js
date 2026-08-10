'use strict';
/**
 * gateway-modules/session-manager.js
 * ────────────────────────────────────
 * Supabase Storage — save and restore Baileys multi-file auth sessions.
 * Sessions are zipped (excluding Chrome cache dirs) and uploaded to the
 * configured Supabase Storage bucket so that a gateway restart on a new
 * machine (or after a disk wipe) can restore the session without a new QR scan.
 *
 * Exported: createSessionManager(ctx) → { saveSession, restoreSessions, cleanupStaleLockFiles }
 *
 * ctx shape: {
 *   supabaseService,  // Supabase client with service-role key
 *   authDataPath,     // local root dir for session folders
 *   logHealthEvent,   // from health-logger
 *   fs, path, os,     // Node core modules (injected for testability)
 *   archiver,         // npm archiver
 *   unzipper,         // npm unzipper
 * }
 */

const SESSION_BUCKET = 'whatsapp-session';

// Glob patterns to exclude from the session zip (Chrome cache junk).
const ZIP_IGNORE = [
    '**/Cache/**', '**/Code Cache/**', '**/GPUCache/**', '**/Service Worker/**',
    '**/Crashpad/**', '**/*.pma', '**/LOCK', '**/SingletonLock', '**/SingletonCookie',
    '**/SingletonSocket', '**/*LOCK*', '**/*lock*', '**/*singleton*', '**/*Singleton*',
    '**/LOG', '**/LOG.old', '**/*cache**', '**/*Cache**', '**/blob_storage/**',
    '**/chrome_cart_db/**', '**/Feature Engagement Tracker/**', '**/Safe Browsing/**',
    '**/component_crx_cache/**', '**/TranslateKit/**', '**/*.blob', '**/*.blob/**',
    '**/IndexedDB/**/*.blob/**', '**/Network/**', '**/databases/**',
    '**/Session Storage/**', '**/Extension State/**', '**/Sync Data/**',
];

function createSessionManager(ctx) {
    const {
        supabaseService,
        authDataPath,
        logHealthEvent,
    } = ctx;

    const fs       = ctx.fs       || require('fs');
    const path     = ctx.path     || require('path');
    const os       = ctx.os       || require('os');
    const archiver = ctx.archiver || require('archiver');
    const unzipper = ctx.unzipper || require('unzipper');

    /**
     * Zip a tenant's session folder and upload to Supabase Storage.
     * Silently skips if the service-role key is not configured.
     */
    async function saveSession(tenantId) {
        if (!supabaseService) {
            console.warn(`[Session Save] SUPABASE_SERVICE_KEY not set. Skipping backup for tenant: ${tenantId}`);
            return;
        }
        const tenantFolder = path.join(authDataPath, `session-${tenantId}`);
        if (!fs.existsSync(tenantFolder)) {
            console.warn(`[Session Save] Folder not found for tenant ${tenantId}. Nothing to save.`);
            return;
        }

        const zipPath  = path.join(os.tmpdir(), `wa_session_backup_${tenantId}.zip`);
        const fileName = `session-${tenantId}.zip`;
        try {
            await new Promise((resolve, reject) => {
                const output  = fs.createWriteStream(zipPath);
                const archive = archiver('zip', { zlib: { level: 9 } });
                output.on('close', resolve);
                archive.on('error', reject);
                archive.pipe(output);
                archive.glob('**/*', { cwd: tenantFolder, ignore: ZIP_IGNORE });
                void archive.finalize(); // return value intentionally ignored
            });

            const zipBuffer = fs.readFileSync(zipPath);
            const { error } = await supabaseService.storage
                .from(SESSION_BUCKET)
                .upload(fileName, zipBuffer, { contentType: 'application/zip', upsert: true });

            if (error) { throw error; }

            console.log(`[Session Save] ✅ Tenant ${tenantId} backed up (${(zipBuffer.length / 1024).toFixed(1)} KB).`);
            if (logHealthEvent) {
                await logHealthEvent('session_saved', 'ok', {
                    path: fileName, size: zipBuffer.length,
                    message: `Session backup saved for tenant ${tenantId}`,
                });
            }
        } catch (err) {
            console.error(`[Session Save Error] Tenant ${tenantId}:`, err.message);
            if (logHealthEvent) {
                await logHealthEvent('session_save_failed', 'error', {
                    error: err.message,
                    message: `Failed to save session for tenant ${tenantId}: ${err.message}`,
                });
            }
        } finally {
            try { fs.unlinkSync(zipPath); } catch (_) {}
        }
    }

    /**
     * List all session zips in Supabase Storage and restore them to local disk.
     * Only restores 'system' by default; set RESTROSUITE_AUTO_CONNECT_ALL_SESSIONS=true
     * to restore all tenant sessions (uses more RAM).
     */
    async function restoreSessions() {
        if (!supabaseService) {
            console.warn('[Session Restore] SUPABASE_SERVICE_KEY not set. Skipping remote restore.');
            return;
        }
        try {
            const { data: files, error } = await supabaseService.storage
                .from(SESSION_BUCKET).list();
            if (error || !files) {
                console.log('[Session Restore] No sessions found or list failed.');
                return;
            }

            const flag    = String(process.env.RESTROSUITE_AUTO_CONNECT_ALL_SESSIONS || 'false').toLowerCase();
            const wantAll = flag === 'true' || flag === '1' || flag === 'yes';

            for (const file of files) {
                if (!file.name.startsWith('session-') || !file.name.endsWith('.zip')) { continue; }
                const tenantId = file.name.slice(8, -4);
                if (!wantAll && tenantId !== 'system') { continue; }

                const zipPath = path.join(os.tmpdir(), `wa_session_restore_${tenantId}.zip`);
                try {
                    const { data, error: dlErr } = await supabaseService.storage
                        .from(SESSION_BUCKET).download(file.name);
                    if (dlErr || !data) { throw dlErr || new Error('No data'); }

                    const buf = Buffer.from(await data.arrayBuffer());
                    fs.writeFileSync(zipPath, buf);

                    const dest = path.join(authDataPath, `session-${tenantId}`);
                    if (fs.existsSync(dest)) {
                        fs.rmSync(dest, { recursive: true, force: true });
                    }
                    fs.mkdirSync(dest, { recursive: true });

                    await fs.createReadStream(zipPath)
                        .pipe(unzipper.Extract({ path: dest }))
                        .promise();

                    cleanupStaleLockFiles(dest);
                    console.log(`[Session Restore] ✅ Tenant ${tenantId} restored.`);
                } catch (e) {
                    console.error(`[Session Restore Error] Tenant ${tenantId}:`, e.message);
                } finally {
                    try { fs.unlinkSync(zipPath); } catch (_) {}
                }
            }
        } catch (err) {
            console.error('[Session Restore Error]', err.message);
        }
    }

    /**
     * Recursively remove stale Chromium lock / socket / singleton files from a
     * session directory so Baileys can open the database without conflicts after
     * a non-graceful shutdown.
     */
    function cleanupStaleLockFiles(dir) {
        if (!fs.existsSync(dir)) { return; }
        try {
            for (const item of fs.readdirSync(dir)) {
                const full = path.join(dir, item);
                let stat;
                try { stat = fs.lstatSync(full); } catch (_) { continue; }
                if (stat.isDirectory()) {
                    cleanupStaleLockFiles(full);
                } else {
                    const lower = item.toLowerCase();
                    if (item === 'LOCK' || lower.includes('lock') || lower.includes('singleton')) {
                        try { fs.unlinkSync(full); } catch (_) {}
                    }
                }
            }
        } catch (err) {
            console.error('[Session Cleanup Error]', err.message);
        }
    }

    return { saveSession, restoreSessions, cleanupStaleLockFiles };
}

module.exports = { createSessionManager };
