'use strict';
/**
 * gateway-modules/health-logger.js
 * ─────────────────────────────────
 * Writes structured events to the gateway_health_log Supabase table and
 * keeps an in-memory ring-buffer of the last 200 events for the /status
 * dashboard endpoint.
 *
 * Exported: createHealthLogger(ctx) → { logHealthEvent, getRecentEvents }
 *
 * ctx shape: { supabaseService }
 */

function createHealthLogger(ctx) {
    const recentHealthEvents = [];

    /**
     * Append an event to the in-memory ring and optionally persist it to
     * Supabase. Never throws — a broken DB connection must not crash the gateway.
     *
     * @param {string} event  - Short machine-readable event name (e.g. 'connected')
     * @param {string} status - 'ok' | 'warning' | 'error'
     * @param {object} [details] - Arbitrary metadata (tenantId, reason, etc.)
     */
    async function logHealthEvent(event, status, details = {}) {
        const entry = { event, status, details, created_at: new Date().toISOString() };

        // In-memory ring buffer — latest first, capped at 200 entries.
        recentHealthEvents.unshift(entry);
        if (recentHealthEvents.length > 200) {
            recentHealthEvents.pop();
        }

        if (!ctx.supabaseService) {
            console.log(`[Health Log] (no service key) ${event} - ${status}`);
            return;
        }
        try {
            await ctx.supabaseService.from('gateway_health_log').insert({ event, status, details });
        } catch (err) {
            console.error('[Health Log Error]', err.message);
        }
    }

    /** Returns a shallow copy of the ring buffer (safe to send to clients). */
    function getRecentEvents() {
        return recentHealthEvents.slice();
    }

    return { logHealthEvent, getRecentEvents };
}

module.exports = { createHealthLogger };
