#!/usr/bin/env node
/**
 * RestroSuite local dev server (Node.js equivalent of run-server.ps1)
 * Serves static files + /api/config from .env.local
 * Proxies /functions/v1/, /rest/v1/, /auth/v1/, /storage/v1/ to real Supabase
 * (doppio-api.js sets BASE='' on localhost, expecting these paths to be local)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8001;
const ROOT = path.resolve(__dirname, '..');

// Load .env.local
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!env[k]) env[k] = v; // first occurrence wins
  }
  return env;
}

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
  res.end(content);
  return true;
}

// Proxy a request to the real Supabase project
function proxyToSupabase(req, res, supabaseHost, urlPath, body = null) {
  const options = {
    hostname: supabaseHost,
    port: 443,
    path: urlPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
    method: req.method,
    headers: {
      ...req.headers,
      host: supabaseHost,
      // Forward origin as the Supabase-allowed origin
      origin: `https://${supabaseHost}`,
    },
  };
  // Remove hop-by-hop headers
  delete options.headers['connection'];
  delete options.headers['transfer-encoding'];

  if (body !== null) {
    options.headers['content-length'] = Buffer.byteLength(body);
  }

  const proxyReq = https.request(options, (proxyRes) => {
    // Pass CORS headers through (Supabase sets them)
    const responseHeaders = { ...proxyRes.headers };
    // Ensure local dev can read the response
    responseHeaders['access-control-allow-origin'] = '*';
    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    console.error('[proxy] Error:', e.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error: ' + e.message);
  });

  if (body !== null) {
    proxyReq.write(body);
    proxyReq.end();
  } else {
    req.pipe(proxyReq);
  }
}

const SUPABASE_PROXY_PREFIXES = [
  '/functions/v1/',
  '/rest/v1/',
  '/auth/v1/',
  '/storage/v1/',
  '/realtime/v1/',
];

function handleLocalGatewayOp(req, res, payload) {
  const env = loadEnv();
  let localGatewayUrl = (env.WHATSAPP_GATEWAY_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  let localGatewayToken = env.WHATSAPP_GATEWAY_TOKEN || env.GATEWAY_TOKEN || 'local-dev-gateway-token';

  const tenantId = payload.tenantId || 'system';
  let gwPath = '';
  let gwMethod = 'GET';
  let gwBody = null;

  if (payload.operation === 'gateway_status') {
    gwPath = '/status';
    gwMethod = 'GET';
  } else if (payload.operation === 'gateway_logout') {
    gwPath = '/logout';
    gwMethod = 'POST';
  } else if (payload.operation === 'gateway_reset') {
    gwPath = '/reset';
    gwMethod = 'POST';
  } else if (payload.operation === 'gateway_logs') {
    gwPath = '/debug-logs?tenantId=' + encodeURIComponent(tenantId);
    gwMethod = 'GET';
  } else if (payload.operation === 'gateway_send') {
    gwPath = '/send';
    gwMethod = 'POST';
    gwBody = JSON.stringify({
      phone: payload.phone,
      message: payload.message,
      orderId: payload.orderId,
      pdfData: payload.pdfData,
      filename: payload.filename
    });
  }

  const urlObj = new URL(localGatewayUrl + gwPath);
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId
  };

  if (localGatewayToken) {
    headers['Authorization'] = localGatewayToken.toLowerCase().startsWith('bearer ')
      ? localGatewayToken
      : `Bearer ${localGatewayToken}`;
  }

  if (gwBody) {
    headers['Content-Length'] = Buffer.byteLength(gwBody);
  }

  console.log(`[Local Dev Backend] Gateway Request: ${gwMethod} ${urlObj.href}`);

  const proxyReq = http.request({
    hostname: urlObj.hostname,
    port: urlObj.port || 80,
    path: urlObj.pathname + urlObj.search,
    method: gwMethod,
    headers: headers
  }, (proxyRes) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
    
    let responseData = '';
    proxyRes.on('data', chunk => { responseData += chunk; });
    proxyRes.on('end', () => {
      let json = {};
      try { json = JSON.parse(responseData); } catch(e) { json = { error: responseData }; }
      res.end(JSON.stringify({ data: json }));
    });
  });

  proxyReq.on('error', (e) => {
    console.error('[Local Dev Backend] Gateway error:', e.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Gateway error: ' + e.message }));
  });

  if (gwBody) {
    proxyReq.write(gwBody);
  }
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = urlObj.pathname;

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // /api/config -- serve Supabase credentials from .env.local
  if (urlPath === '/api/config') {
    const env = loadEnv();
    const supabaseUrl = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth|storage|functions)\/v1$/, '');
    const supabaseAnonKey = env.SUPABASE_ANON_KEY || '';
    const enableDemoTools = env.ENABLE_DEMO_TOOLS === 'true';
    const zeroCostLaunchMode = env.ZERO_COST_LAUNCH_MODE === 'true';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ supabaseUrl, supabaseAnonKey, enableDemoTools, zeroCostLaunchMode }));
  }

  // Intercept client gateway operations to run locally (allowing testing of the local gateway without cloud routing)
  if (urlPath === '/functions/v1/tenant-data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload = null;
      try { payload = JSON.parse(body); } catch(e) {}
      const GATEWAY_OPS = ['gateway_status', 'gateway_logs', 'gateway_reset', 'gateway_logout', 'gateway_send'];
      if (payload && GATEWAY_OPS.includes(payload.operation)) {
        return handleLocalGatewayOp(req, res, payload);
      }
      // Not a gateway operation, proxy to Supabase with the buffered body
      const env = loadEnv();
      const supabaseUrl = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
      if (!supabaseUrl) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        return res.end('SUPABASE_URL not set in .env.local');
      }
      const supabaseHost = new URL(supabaseUrl).hostname;
      console.log(`[proxy] POST ${urlPath} -> ${supabaseHost}`);
      return proxyToSupabase(req, res, supabaseHost, urlPath, body);
    });
    return;
  }

  // Proxy Supabase API paths to the real project
  const isSupabasePath = SUPABASE_PROXY_PREFIXES.some(p => urlPath.startsWith(p));
  if (isSupabasePath) {
    const env = loadEnv();
    const supabaseUrl = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
    if (!supabaseUrl) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('SUPABASE_URL not set in .env.local');
    }
    const supabaseHost = new URL(supabaseUrl).hostname;
    console.log(`[proxy] ${req.method} ${urlPath} -> ${supabaseHost}`);
    return proxyToSupabase(req, res, supabaseHost, urlPath);
  }

  // Route aliases (mirrors vercel.json rewrites)
  const aliases = { '/login': '/login.html', '/dashboard': '/dashboard.html' };
  const resolvedPath = aliases[urlPath] || urlPath;
  const finalPath = resolvedPath === '/' ? '/index.html' : resolvedPath;

  const filePath = path.join(ROOT, finalPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); return res.end('Forbidden');
  }

  if (!serveFile(res, filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 Not Found: ${finalPath}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const env = loadEnv();
  const supabaseUrl = env.SUPABASE_URL || '(not set)';
  console.log(`\n✅ RestroSuite dev server running at: http://localhost:${PORT}/`);
  console.log(`   Proxying Supabase API calls to: ${supabaseUrl}`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`   Login:     http://localhost:${PORT}/login.html`);
  console.log(`   Press Ctrl+C to stop.\n`);
});
