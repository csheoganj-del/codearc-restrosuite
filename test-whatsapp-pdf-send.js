/**
 * test-whatsapp-pdf-send.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests whether the WhatsApp gateway correctly sends a PDF receipt vs text.
 *
 * Usage:
 *   node test-whatsapp-pdf-send.js
 *
 * Prerequisites:
 *   - WhatsApp gateway running  (node whatsapp-gateway.js  OR  run-gateway.ps1)
 *   - WhatsApp paired (QR scanned) so the gateway status is "ready"
 *   - A real phone number to receive the test message
 *
 * Configure via env vars or edit the CONFIG block below.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const http  = require('http');
const https = require('https');

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIG  — edit these or set as environment variables
// ══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
  gatewayUrl   : process.env.WHATSAPP_GATEWAY_URL   || 'http://localhost:3000',
  gatewayToken : process.env.WHATSAPP_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN || 'restrosuite-gw-2024-secure',
  testPhone    : process.env.TEST_PHONE              || '',   // e.g. '919876543210'  (with country code, no +)
  tenantId     : process.env.TENANT_ID               || 'system',
};
// ══════════════════════════════════════════════════════════════════════════════

// ── Minimal valid PDF (base64) ─────────────────────────────────────────────
// A tiny 1-page PDF that just says "TEST RECEIPT — PDF OK" so you can confirm
// WhatsApp actually delivers a file attachment (not a text bubble).
const MINIMAL_PDF_BASE64 = (function () {
  const raw = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 300 100]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 60>>stream
BT /F1 16 Tf 20 60 Td (TEST RECEIPT -- PDF OK) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000376 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
441
%%EOF`;
  return Buffer.from(raw).toString('base64');
})();

// ── Sample bill text receipt ───────────────────────────────────────────────
const SAMPLE_TEXT = `*RESTROSUITE TEST RECEIPT*
─────────────────────────
Order  : TEST-001
Date   : ${new Date().toLocaleString('en-IN')}
─────────────────────────
1x Test Item         ₹100
─────────────────────────
Total            ₹100.00
─────────────────────────
_This is a test message_`;

// ── Helpers ────────────────────────────────────────────────────────────────
const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';

function log(icon, msg) { console.log(`  ${icon}  ${msg}`); }

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : undefined;

    const req = lib.request({
      hostname : parsed.hostname,
      port     : parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path     : parsed.pathname + parsed.search,
      method   : options.method || 'GET',
      headers  : {
        'Content-Type'  : 'application/json',
        'Authorization' : `Bearer ${CONFIG.gatewayToken}`,
        'x-tenant-id'   : CONFIG.tenantId,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Test runner ────────────────────────────────────────────────────────────
async function run() {
  console.log('\n\x1b[1m══════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m  WhatsApp PDF Send — Test Suite\x1b[0m');
  console.log('\x1b[1m══════════════════════════════════════════════════════\x1b[0m\n');

  let passed = 0, failed = 0;

  // ── TEST 1: Gateway reachable ──────────────────────────────────────────
  console.log('\x1b[1m[1] Gateway reachability\x1b[0m');
  try {
    const r = await request(`${CONFIG.gatewayUrl}/status`, { method: 'GET' });
    if (r.status === 200) {
      log(PASS, `Gateway reachable at ${CONFIG.gatewayUrl}`);
      log(INFO, `Status: ${JSON.stringify(r.body?.status ?? r.body)}`);
      passed++;
    } else {
      log(FAIL, `Gateway returned HTTP ${r.status} — is it running?`);
      failed++;
    }
  } catch (e) {
    log(FAIL, `Cannot reach gateway: ${e.message}`);
    log(WARN, 'Start the gateway with: node whatsapp-gateway.js  or  run-gateway.ps1');
    failed++;
    console.log('\n\x1b[31mAborting — gateway is not running.\x1b[0m\n');
    printSummary(passed, failed);
    return;
  }

  // ── TEST 2: Gateway WhatsApp status (must be "ready") ─────────────────
  console.log('\n\x1b[1m[2] WhatsApp connection status\x1b[0m');
  try {
    const r = await request(`${CONFIG.gatewayUrl}/status`, { method: 'GET' });
    const status = r.body?.status || r.body?.whatsapp || '';
    if (status === 'ready' || String(status).toLowerCase().includes('ready')) {
      log(PASS, `WhatsApp is connected (status: "${status}")`);
      passed++;
    } else {
      log(FAIL, `WhatsApp not ready — status: "${status}"`);
      log(WARN, 'Scan the QR code in Settings → WhatsApp Gateway before running send tests.');
      failed++;
    }
  } catch (e) {
    log(FAIL, `Status check failed: ${e.message}`);
    failed++;
  }

  // ── TEST 3: /send with pdfData — verifies PDF path works ──────────────
  console.log('\n\x1b[1m[3] /send with pdfData (PDF path)\x1b[0m');
  if (!CONFIG.testPhone) {
    log(WARN, 'TEST_PHONE not set — skipping live send tests.');
    log(INFO, 'Set it: TEST_PHONE=919876543210 node test-whatsapp-pdf-send.js');
  } else {
    try {
      const payload = {
        phone    : CONFIG.testPhone,
        message  : SAMPLE_TEXT,
        pdfData  : MINIMAL_PDF_BASE64,
        filename : 'test-receipt.pdf',
        orderId  : 'TEST-PDF-001',
      };
      log(INFO, `Sending PDF to +${CONFIG.testPhone} (pdfData length: ${MINIMAL_PDF_BASE64.length} chars)`);
      const r = await request(`${CONFIG.gatewayUrl}/send`, { method: 'POST' }, payload);

      if (r.status === 200 && !r.body?.error) {
        log(PASS, `Gateway accepted PDF send  →  status: ${r.body?.status ?? 'ok'}`);
        log(INFO, 'Check your WhatsApp — you should receive a FILE attachment, not a text bubble.');
        passed++;
      } else {
        log(FAIL, `Gateway rejected PDF send  →  HTTP ${r.status}: ${r.body?.error || JSON.stringify(r.body)}`);
        // Diagnose the reason
        if (r.status === 401) log(WARN, 'Token mismatch — check GATEWAY_TOKEN in .env.local vs run-gateway.ps1');
        if (r.status === 400) log(WARN, 'Missing/invalid body fields — check phone format or pdfData');
        if (r.status === 413) log(WARN, 'PDF too large — Express body limit exceeded (fix: app.use(express.json({ limit: "10mb" })))');
        failed++;
      }
    } catch (e) {
      log(FAIL, `PDF send request failed: ${e.message}`);
      failed++;
    }

    // ── TEST 4: /send without pdfData — verifies text path works ──────
    console.log('\n\x1b[1m[4] /send without pdfData (text path)\x1b[0m');
    try {
      const payload = {
        phone   : CONFIG.testPhone,
        message : SAMPLE_TEXT,
        orderId : 'TEST-TEXT-001',
      };
      log(INFO, `Sending text-only receipt to +${CONFIG.testPhone}`);
      const r = await request(`${CONFIG.gatewayUrl}/send`, { method: 'POST' }, payload);

      if (r.status === 200 && !r.body?.error) {
        log(PASS, `Gateway accepted text send  →  status: ${r.body?.status ?? 'ok'}`);
        log(INFO, 'Check your WhatsApp — you should receive a TEXT message (no attachment).');
        passed++;
      } else {
        log(FAIL, `Gateway rejected text send  →  HTTP ${r.status}: ${r.body?.error || JSON.stringify(r.body)}`);
        failed++;
      }
    } catch (e) {
      log(FAIL, `Text send request failed: ${e.message}`);
      failed++;
    }

    // ── TEST 5: /send with pdfData but no message (edge-case fix) ──────
    console.log('\n\x1b[1m[5] /send with pdfData only (no message body) — edge case\x1b[0m');
    try {
      const payload = {
        phone    : CONFIG.testPhone,
        pdfData  : MINIMAL_PDF_BASE64,
        filename : 'test-receipt-notext.pdf',
        orderId  : 'TEST-PDF-ONLY-001',
      };
      log(INFO, 'Sending pdfData without a message field (should succeed at gateway)');
      const r = await request(`${CONFIG.gatewayUrl}/send`, { method: 'POST' }, payload);

      if (r.status === 200 && !r.body?.error) {
        log(PASS, 'Gateway accepted PDF-only send — edge function fix is working');
        passed++;
      } else if (r.status === 400) {
        log(FAIL, `Gateway rejected PDF-only send with 400 — validation too strict: ${r.body?.error}`);
        log(WARN, 'Gateway /send check should be: if (!phone || (!message && !pdfData))');
        failed++;
      } else {
        log(WARN, `Unexpected response HTTP ${r.status}: ${JSON.stringify(r.body)}`);
        failed++;
      }
    } catch (e) {
      log(FAIL, `PDF-only send failed: ${e.message}`);
      failed++;
    }
  }

  // ── TEST 6: Express body size — can it handle a real-world PDF? ───────
  console.log('\n\x1b[1m[6] Express body size limit check\x1b[0m');
  // Simulate a 150KB base64 blob (typical jsPDF receipt = 30-80KB raw = 40-110KB base64)
  const LARGE_B64 = Buffer.alloc(150 * 1024, 'A').toString('base64'); // ~200KB base64
  try {
    const payload = {
      phone    : CONFIG.testPhone || '910000000000',  // dummy phone if not set
      message  : 'size test',
      pdfData  : LARGE_B64,
      filename : 'size-test.pdf',
      orderId  : 'TEST-SIZE-001',
    };
    log(INFO, `Sending 200KB base64 payload to test Express body limit...`);
    const r = await request(`${CONFIG.gatewayUrl}/send`, { method: 'POST' }, payload);

    if (r.status === 413) {
      log(FAIL, 'Express returned 413 Payload Too Large — body size limit is too small!');
      log(WARN, 'Fix: change  app.use(express.json())  to  app.use(express.json({ limit: "10mb" }))');
      failed++;
    } else if (r.status === 401 || r.status === 400 || r.status === 200) {
      // 401 = token check happened = body was parsed = no size issue
      // 400 = validation check = body was parsed = no size issue
      // 200 = sent (unlikely with dummy phone)
      log(PASS, `Body parsed successfully (HTTP ${r.status}) — Express limit is fine for 200KB`);
      passed++;
    } else {
      log(INFO, `HTTP ${r.status} — body may have been parsed; check gateway logs`);
    }
  } catch (e) {
    log(FAIL, `Size test request failed: ${e.message}`);
    failed++;
  }

  printSummary(passed, failed);
}

function printSummary(passed, failed) {
  const total = passed + failed;
  console.log('\n\x1b[1m══════════════════════════════════════════════════════\x1b[0m');
  console.log(`\x1b[1m  Results: ${passed}/${total} passed\x1b[0m`);
  if (failed === 0) {
    console.log('  \x1b[32mAll tests passed — PDF sending should work correctly.\x1b[0m');
  } else {
    console.log(`  \x1b[31m${failed} test(s) failed — see details above.\x1b[0m`);
  }
  console.log('\x1b[1m══════════════════════════════════════════════════════\x1b[0m\n');
}

run().catch(e => {
  console.error('\nUnhandled error:', e.message);
  process.exit(1);
});
