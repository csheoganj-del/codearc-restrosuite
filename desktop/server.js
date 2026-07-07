/* ============================================================
   RestroSuite Desktop -- local static server
   ------------------------------------------------------------
   Serves a byte-identical copy of the web app (./app) and
   replicates the two things Vercel does in production:
     1. cleanUrls  -> "/login" resolves to "login.html"
     2. rewrites   -> the parametric + named routes in vercel.json
     3. /api/config -> the same JSON the Vercel serverless function
                       returns, so config.js resolves instantly and
                       WITHOUT internet (values come from config.json).

   Because the app is served from http://localhost:8001 -- an origin
   already present in the Edge Functions' ALLOWED_ORIGINS allowlist --
   Supabase calls pass CORS unchanged when online. Offline, RS_DB's
   own local cache + sync queue take over automatically.

   NOTE: this file is part of the desktop wrapper ONLY. The web app
   itself is never modified.
   ============================================================ */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

// Named rewrites copied verbatim from ../vercel.json so desktop routing
// matches production exactly. Keep in sync if you add new pages.
const REWRITES = {
  '/login': '/login.html',
  '/dashboard': '/dashboard.html',
  '/home': '/home.html',
  '/order': '/order.html',
  '/qr-order': '/qr-order.html',
  '/kds': '/kds.html',
  '/tokens': '/tokens.html',
  '/privacy': '/privacy.html',
  '/terms': '/terms.html',
  '/refund-policy': '/refund-policy.html',
};

/**
 * Build the Express app.
 * @param {object} opts
 * @param {string} opts.root   Absolute path to the folder holding the web app.
 * @param {object} opts.config Parsed config.json { supabaseUrl, supabaseAnonKey, ... }
 */
function createServer(opts) {
  const root = opts.root;
  const config = opts.config || {};
  const app = express();

  // --- /api/config : mirror the production Vercel function ------------------
  app.get('/api/config', (req, res) => {
    const supabaseUrl = String(config.supabaseUrl || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/(rest|auth|storage|functions)\/v1$/, '')
      .replace(/\/+$/, '');
    const supabaseAnonKey = String(config.supabaseAnonKey || '').trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(503).json({
        error: 'Supabase credentials missing. Edit desktop/config.json.',
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      supabaseUrl,
      supabaseAnonKey,
      enableDemoTools: !!config.enableDemoTools,
      zeroCostLaunchMode: !!config.zeroCostLaunchMode,
    });
  });

  // --- Parametric rewrite: /bill/:slug/:no -> /bill.html?slug=..&no=.. ------
  app.get(/^\/bill\/([^/]+)\/([^/]+)\/?$/, (req, res) => {
    const file = path.join(root, 'bill.html');
    if (fs.existsSync(file)) return res.sendFile(file);
    return res.status(404).end();
  });

  // --- Named rewrites + cleanUrls ------------------------------------------
  app.use((req, res, next) => {
    // Strip query for matching, keep it for the served file (browser keeps it).
    const pathname = req.path;

    // Explicit named rewrites first.
    if (REWRITES[pathname]) {
      const file = path.join(root, REWRITES[pathname]);
      if (fs.existsSync(file)) return res.sendFile(file);
    }

    // cleanUrls: "/foo" -> "foo.html" when that file exists and the path has
    // no extension.
    if (pathname !== '/' && !path.extname(pathname)) {
      const candidate = path.join(root, pathname + '.html');
      if (fs.existsSync(candidate)) return res.sendFile(candidate);
    }
    next();
  });

  // --- Static files (assets, src, config.js, service-worker.js, etc.) ------
  app.use(express.static(root, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      // Service worker must not be cached so updates take effect.
      if (filePath.endsWith('service-worker.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // --- Root -> the configured entry page -----------------------------------
  app.get('/', (req, res) => {
    const entry = (config.entry || '/login').replace(/^\//, '');
    const file = path.join(root, entry.endsWith('.html') ? entry : entry + '.html');
    if (fs.existsSync(file)) return res.sendFile(file);
    return res.sendFile(path.join(root, 'index.html'));
  });

  return app;
}

module.exports = { createServer, REWRITES };
