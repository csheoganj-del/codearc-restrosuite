'use strict';
/**
 * gateway-modules/send-engine.js
 * ──────────────────────────────
 * Human-crafted WhatsApp send engine. Makes automated bill receipts look and
 * feel like a staff member typed and sent them — not a bulk API blast.
 *
 * Techniques applied:
 *  - Per-tenant serialized send queue (no burst)
 *  - Variable open-chat → typing → send → online presence simulation
 *  - Natural caption variants ("Here's your bill", "Sharing your bill", …)
 *  - Invisible Unicode zero-width spaces for message uniqueness
 *  - Daily send limit with disk-persisted counter (survives restarts)
 *  - Business-hours soft check (warns, but still sends outside 8am–10pm)
 *  - Suppresses bill-style openers for OTP / security messages
 *
 * Exported: createSendEngine(ctx) → { humanSend, humanCraftCaption, isSystemOrTransactionalMessage }
 *
 * ctx shape: { authDataPath, fs, path }
 */

const DAILY_LIMIT      = process.env.DAILY_LIMIT ? parseInt(process.env.DAILY_LIMIT, 10) : 180;
const HUMAN_CRAFT_MODE = String(process.env.HUMAN_CRAFT_MODE || 'true').toLowerCase() !== 'false';

function createSendEngine(ctx) {
    const { authDataPath } = ctx;
    const fs   = ctx.fs   || require('fs');
    const path = ctx.path || require('path');

    // ── Daily counter (persisted to disk) ──────────────────────────────────
    const _dailySendCount = {};

    function _dailyCounterPath() {
        return path.join(authDataPath, 'daily-send-counts.json');
    }

    function loadDailyCounts() {
        try {
            const p = _dailyCounterPath();
            if (!fs.existsSync(p)) { return; }
            const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (parsed && typeof parsed === 'object') {
                const today = new Date().toISOString().slice(0, 10);
                for (const tid of Object.keys(parsed)) {
                    if (parsed[tid] && parsed[tid].date === today) {
                        _dailySendCount[tid] = parsed[tid];
                    }
                }
                console.log(`[DailyCounter] Loaded ${Object.keys(_dailySendCount).length} tenant count(s).`);
            }
        } catch (err) {
            console.warn('[DailyCounter] Load failed (non-fatal):', err.message);
        }
    }

    function _flushDailyCounts() {
        try {
            const p   = _dailyCounterPath();
            const tmp = p + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(_dailySendCount, null, 2), 'utf8');
            fs.renameSync(tmp, p);
        } catch (err) {
            console.warn('[DailyCounter] Flush failed (non-fatal):', err.message);
        }
    }

    function _checkDailyLimit(tenantId) {
        const today = new Date().toISOString().slice(0, 10);
        if (!_dailySendCount[tenantId] || _dailySendCount[tenantId].date !== today) {
            _dailySendCount[tenantId] = { date: today, count: 0 };
        }
        if (_dailySendCount[tenantId].count >= DAILY_LIMIT) { return false; }
        _dailySendCount[tenantId].count++;
        _flushDailyCounts();
        return true;
    }

    // Load on construction — authDataPath is already established by caller.
    loadDailyCounts();

    // ── Queues & timestamps ────────────────────────────────────────────────
    const _sendQueues = new Map();
    const _lastSendAt = new Map();
    // Rolling send latencies (ms) for Super-Admin Gateway KPI
    const _sendLatencySamples = [];
    const SEND_LATENCY_MAX = 40;
    const _inflightByTenant = new Map(); // tenantId → pending count

    function recordSendLatency(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n) || n < 0) return;
        _sendLatencySamples.push(Math.round(n));
        if (_sendLatencySamples.length > SEND_LATENCY_MAX) _sendLatencySamples.shift();
    }

    function getSendStats() {
        const avgLatencyMs = _sendLatencySamples.length
            ? Math.round(_sendLatencySamples.reduce((a, b) => a + b, 0) / _sendLatencySamples.length)
            : null;
        let queued = 0;
        for (const n of _inflightByTenant.values()) queued += Math.max(0, Number(n) || 0);
        return {
            avgLatencyMs,
            latencySamples: _sendLatencySamples.length,
            queued,
            queue_length: queued,
        };
    }

    // ── Utility helpers ────────────────────────────────────────────────────
    function _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function _sleep(ms) { return new Promise((r) => { setTimeout(r, ms); }); }
    function _pick(arr) { return arr[_randInt(0, arr.length - 1)]; }

    function _isBusinessHour() {
        const h = new Date().getHours();
        return h >= 8 && h < 22;
    }

    // ── Message classification ─────────────────────────────────────────────
    function isSystemOrTransactionalMessage(text) {
        const t = String(text || '').trim();
        if (!t) { return false; }
        return (
            /\b(verification code|password reset|otp|one[- ]time|security code|login code|auth code)\b/i.test(t) ||
            /\b(never share this code|valid for \d+\s*minutes?)\b/i.test(t) ||
            /\bRestroSuite\b.*\bcode is\b/i.test(t) ||
            /\byour code is\b/i.test(t) ||
            /\bcodearc\b.*\b(alert|monitor|gateway)\b/i.test(t)
        );
    }

    // ── Caption crafter ────────────────────────────────────────────────────
    function humanCraftCaption({ orderId, outletName, isPlatform, baseCaption }) {
        if (!HUMAN_CRAFT_MODE) {
            return (baseCaption || (orderId ? `Bill ${orderId}` : 'Your bill')).toString().slice(0, 200);
        }
        if (isSystemOrTransactionalMessage(baseCaption)) {
            return String(baseCaption || '').trim().slice(0, 400);
        }
        const brand   = String(outletName || '').trim().slice(0, 48);
        const billRef = orderId ? String(orderId).replace(/^DO-/i, '').slice(0, 24) : '';
        const thanks  = [
            'Thanks for visiting us!', 'Thank you for dining with us 🙏',
            'Thanks a lot — hope you enjoyed!', 'Appreciate your visit today!',
            'Thank you! Do visit again 😊',
        ];
        const openers = [
            'Here\u2019s your bill', 'Sharing your bill', 'Your bill is ready',
            'Bill attached', 'Please find your bill',
        ];
        const closers = ['Have a great day!', 'Take care!', 'See you soon!', 'Warm regards', ''];

        let line1 = _pick(openers);
        if (billRef && Math.random() < 0.55) { line1 += ` (${billRef})`; }
        else if (billRef && Math.random() < 0.35) { line1 += `. Ref: ${billRef}`; }
        const parts = [line1, _pick(thanks)];
        const c = _pick(closers);
        if (c) { parts.push(c); }
        if (isPlatform && brand) {
            parts.unshift(Math.random() < 0.5 ? brand : `From ${brand}`);
        } else if (brand && Math.random() < 0.4) {
            parts.push(`\u2014 ${brand}`);
        }
        const base = String(baseCaption || '').trim();
        if (base && base.length > 8 && !/^bill\s/i.test(base) && Math.random() < 0.25) {
            parts.splice(1, 0, base.slice(0, 120));
        }
        return parts.filter(Boolean).join('\n').slice(0, 400);
    }

    // ── Presence & timing helpers ──────────────────────────────────────────
    function _humanDelay(messageText, isDocument) {
        const len      = (messageText || '').length;
        const openChat = _randInt(400, 1400);
        const typeMs   = Math.min(len * _randInt(18, 35), isDocument ? 4500 : 8000);
        const think    = Math.random() < 0.35 ? _randInt(600, 2200) : _randInt(0, 400);
        const attach   = isDocument ? _randInt(1200, 3500) : 0;
        const jitter   = _randInt(500, 2000);
        return openChat + typeMs + think + attach + jitter;
    }

    function _betweenMessageDelay(tenantId) {
        const n = (_dailySendCount[tenantId] && _dailySendCount[tenantId].count) || 1;
        return _randInt(n < 8 ? 5000 : 3500, n < 8 ? 14000 : 11000);
    }

    async function _paceIfBursting(tenantId) {
        const last    = _lastSendAt.get(tenantId) || 0;
        const elapsed = Date.now() - last;
        const minGap  = _randInt(2500, 5500);
        if (last && elapsed < minGap) {
            await _sleep(minGap - elapsed + _randInt(200, 900));
        }
    }

    function _uniquifyText(text) {
        if (typeof text !== 'string' || !text.length) { return text; }
        let out = text;
        if (Math.random() < 0.2 && !/\s$/.test(out)) { out += ' '; }
        out += '\u200B'.repeat(_randInt(0, 3));
        return out;
    }

    async function _humanPresenceBeforeSend(client, jid, msgText, isDocument) {
        try { await client.sendPresenceUpdate('available', jid); } catch (_) {}
        await _sleep(_randInt(300, 900));
        if (Math.random() < 0.4) {
            try { await client.sendPresenceUpdate('paused', jid); } catch (_) {}
            await _sleep(_randInt(400, 1200));
        }
        try { await client.sendPresenceUpdate('composing', jid); } catch (_) {}
        const total = _humanDelay(msgText, isDocument);
        if (total > 2500 && Math.random() < 0.4) {
            const mid = Math.floor(total * 0.45);
            await _sleep(mid);
            try { await client.sendPresenceUpdate('paused', jid); } catch (_) {}
            await _sleep(_randInt(350, 1100));
            try { await client.sendPresenceUpdate('composing', jid); } catch (_) {}
            await _sleep(total - mid);
        } else {
            await _sleep(total);
        }
    }

    // ── Public send method ─────────────────────────────────────────────────
    /**
     * humanSend — drop-in for client.sendMessage with human-crafted pacing.
     *
     * @param {object} client    - Active Baileys socket
     * @param {string} chatId    - Recipient JID or phone@c.us
     * @param {string|object} msg
     * @param {object} [opts]
     * @param {string} [tenantId]
     * @returns {Promise<object>} Baileys send result
     */
    async function humanSend(client, chatId, msg, opts, tenantId) {
        tenantId = tenantId || chatId;

        let jid = chatId;
        if (jid && jid.endsWith('@c.us')) {
            jid = jid.replace('@c.us', '@s.whatsapp.net');
        }

        if (!_checkDailyLimit(tenantId)) {
            console.warn(`[HumanSend] Daily limit (${DAILY_LIMIT}) reached for ${tenantId}.`);
            throw new Error('Daily WhatsApp send limit reached for this outlet. Try again tomorrow.');
        }
        if (!_isBusinessHour()) {
            console.warn(`[HumanSend] Sending outside business hours for ${tenantId} (still allowed).`);
        }

        const prev = _sendQueues.get(tenantId) || Promise.resolve();
        _inflightByTenant.set(tenantId, (_inflightByTenant.get(tenantId) || 0) + 1);
        const next = prev.then(async () => {
            const t0 = Date.now();
            try {
                await _paceIfBursting(tenantId);
                const msgText  = typeof msg === 'string' ? msg : (msg && (msg.text || msg.caption) || '');
                const isDoc    = !!(msg && typeof msg === 'object' && msg.document);
                await _humanPresenceBeforeSend(client, jid, msgText, isDoc);

                let result;
                if (typeof msg === 'string') {
                    result = await client.sendMessage(jid, { text: _uniquifyText(msg) }, opts || {});
                } else if (msg && typeof msg.text === 'string') {
                    result = await client.sendMessage(jid, { ...msg, text: _uniquifyText(msg.text) }, opts || {});
                } else if (msg && typeof msg.caption === 'string') {
                    result = await client.sendMessage(jid, { ...msg, caption: _uniquifyText(msg.caption) }, opts || {});
                } else {
                    result = await client.sendMessage(jid, msg, opts || {});
                }

                try { await client.sendPresenceUpdate('paused', jid); } catch (_) {}
                if (Math.random() < 0.35) {
                    await _sleep(_randInt(400, 1500));
                    try { await client.sendPresenceUpdate('available', jid); } catch (_) {}
                }
                _lastSendAt.set(tenantId, Date.now());
                recordSendLatency(Date.now() - t0);
                await _sleep(_betweenMessageDelay(tenantId));
                return result;
            } catch (err) {
                await _sleep(_betweenMessageDelay(tenantId));
                throw err;
            } finally {
                const left = (_inflightByTenant.get(tenantId) || 1) - 1;
                if (left <= 0) _inflightByTenant.delete(tenantId);
                else _inflightByTenant.set(tenantId, left);
            }
        });

        _sendQueues.set(tenantId, next.catch(() => {}));
        return next;
    }

    return { humanSend, humanCraftCaption, isSystemOrTransactionalMessage, getSendStats };
}

module.exports = { createSendEngine };
