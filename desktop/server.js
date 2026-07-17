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
function normalizeSupabaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(rest|auth|storage|functions)\/v1$/, '')
    .replace(/\/+$/, '');
}

function createServer(opts) {
  const root = opts.root;
  const config = opts.config || {};
  const app = express();
  // JSON body for Edge Function proxy (login, tenant-data, etc.)
  app.use(express.json({ limit: '4mb' }));
  app.use(express.text({ type: ['text/*', 'application/x-www-form-urlencoded'], limit: '1mb' }));

  const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl);
  const supabaseAnonKey = String(config.supabaseAnonKey || '').trim();

  // --- /api/config : mirror the production Vercel function ------------------
  app.get('/api/config', (req, res) => {
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

  // --- Edge Function proxy -------------------------------------------------
  // doppio-api.js sets BASE='' on localhost so fetch('/functions/v1/tenant-access')
  // hits THIS local server, not Supabase directly. That avoids Electron CORS
  // breakage (browser OK, EXE failed with generic "Login failed").
  // We forward the body + auth headers to Supabase and return the response as-is.
  async function proxyToSupabase(req, res, remotePath) {
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(503).json({ error: 'Supabase not configured in desktop/config.json' });
    }
    const target = supabaseUrl + remotePath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    const headers = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      apikey: supabaseAnonKey,
      Authorization: req.headers.authorization || ('Bearer ' + supabaseAnonKey),
      // Edge Functions CORS allowlist production origins; server-side fetch is not CORS-bound.
      Origin: String(config.productionOrigin || 'https://restrosuite.codearc.co.in').replace(/\/+$/, ''),
    };
    // Forward optional client info headers if present
    if (req.headers['x-client-info']) headers['x-client-info'] = req.headers['x-client-info'];

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (typeof req.body === 'string') body = req.body;
      else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
        body = JSON.stringify(req.body);
      } else {
        body = undefined;
      }
    }

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body,
      });
      const text = await upstream.text();
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(text);
    } catch (err) {
      console.error('[desktop-proxy]', remotePath, err && err.message);
      return res.status(502).json({
        error: 'Desktop could not reach Supabase: ' + String(err && err.message || err),
      });
    }
  }

  app.all('/functions/v1/:fnName', (req, res) => {
    const fn = encodeURIComponent(req.params.fnName);
    return proxyToSupabase(req, res, '/functions/v1/' + fn);
  });

  // REST API (menu/sync occasionally uses fetch to /rest/v1 when BASE is '')
  app.all(/^\/rest\/v1(\/.*)?$/, (req, res) => {
    const sub = req.path.replace(/^\/rest\/v1/, '') || '';
    return proxyToSupabase(req, res, '/rest/v1' + sub);
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
