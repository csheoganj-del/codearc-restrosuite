'use strict';
/**
 * gateway-modules/index.js — barrel export
 * ─────────────────────────────────────────
 * Convenience re-export so the main gateway file can require a single path:
 *
 *   const {
 *     createHealthLogger,
 *     createAlertManager,
 *     createSendEngine,
 *     createSessionManager,
 *   } = require('./gateway-modules');
 *
 * Each factory receives a shared context object (ctx) so modules can call
 * each other's functions without circular requires. Build ctx in the main
 * file and pass it after constructing each module:
 *
 *   const ctx = { supabaseService, authDataPath, fs, path, os, archiver, unzipper };
 *   const { logHealthEvent, getRecentEvents } = createHealthLogger(ctx);
 *   ctx.logHealthEvent = logHealthEvent;   // inject back for other modules
 *   const { sendAdminAlert } = createAlertManager(ctx);
 *   ctx.sendAdminAlert = sendAdminAlert;
 *   // … etc.
 */

const { createHealthLogger }  = require('./health-logger');
const { createAlertManager }  = require('./alert-manager');
const { createSendEngine }    = require('./send-engine');
const { createSessionManager } = require('./session-manager');

module.exports = {
    createHealthLogger,
    createAlertManager,
    createSendEngine,
    createSessionManager,
};
