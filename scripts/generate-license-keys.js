#!/usr/bin/env node
/* ============================================================================
   RestroSuite — License signing key generator
   ----------------------------------------------------------------------------
   Generates the asymmetric key pair used by the offline-lease system:

     • PRIVATE key  -> lives ONLY in the Supabase Edge Function environment
                       (secret name: LICENSE_SIGNING_KEY). Never ships to any
                       client. This is what signs each short-lived lease.

     • PUBLIC key   -> embedded in every client (web/PWA, desktop, Android).
                       Clients can VERIFY a lease but can never FORGE or EXTEND
                       one, because they do not hold the private half.

   Algorithm: ECDSA P-256 / SHA-256.
   (The original design note said Ed25519; we use ECDSA P-256 instead purely
   for reach — it is verifiable by every target out of the box: WebCrypto in
   old Android System WebViews, Node/Electron, and Java's "SHA256withECDSA".
   Ed25519 WebCrypto only landed in Chromium 137 / Java 15+, which would strand
   older POS devices. The security property — asymmetric, client-unforgeable —
   is identical.)

   Usage:
     node scripts/generate-license-keys.js            # generate a fresh pair
     node scripts/generate-license-keys.js --dev      # also write a local dev
                                                       # private key for tests

   After running for PRODUCTION:
     1. Copy the printed PRIVATE key (base64, one line) and set it as a
        Supabase secret:
            supabase secrets set LICENSE_SIGNING_KEY="<base64 pkcs8>"
     2. Paste the printed PUBLIC key into assets/license-config.js
        (RS_LICENSE_PUBLIC_KEY_SPKI_B64). The generator does this for you
        automatically when the file exists.
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const isDev = process.argv.includes('--dev');

// ECDSA P-256 key pair.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1', // == P-256 / secp256r1
});

const privatePkcs8B64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const publicSpkiB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

// -- Try to patch the client config file so the public key is always in sync --
const configPath = path.join(__dirname, '..', 'assets', 'license-config.js');
let patched = false;
try {
  if (fs.existsSync(configPath)) {
    let src = fs.readFileSync(configPath, 'utf8');
    const re = /(RS_LICENSE_PUBLIC_KEY_SPKI_B64\s*:\s*)"[^"]*"/;
    if (re.test(src)) {
      src = src.replace(re, `$1"${publicSpkiB64}"`);
      fs.writeFileSync(configPath, src);
      patched = true;
    }
  }
} catch (e) {
  console.warn('Could not auto-patch assets/license-config.js:', e.message);
}

// -- Optionally stash a dev private key for the local test harness ------------
if (isDev) {
  const devPath = path.join(__dirname, '.license-signing-key.dev.b64');
  fs.writeFileSync(devPath, privatePkcs8B64 + '\n', { mode: 0o600 });
  console.log(`\nDEV private key written to ${devPath} (gitignored — do NOT ship).`);
}

console.log('\n============================================================');
console.log(' RestroSuite license key pair (ECDSA P-256)');
console.log('============================================================\n');
console.log('PRIVATE KEY  (set as Supabase secret LICENSE_SIGNING_KEY):\n');
console.log(privatePkcs8B64 + '\n');
console.log('PUBLIC KEY   (embed in clients — RS_LICENSE_PUBLIC_KEY_SPKI_B64):\n');
console.log(publicSpkiB64 + '\n');
console.log('------------------------------------------------------------');
console.log(patched
  ? 'assets/license-config.js was updated with the new public key.'
  : 'assets/license-config.js NOT patched — paste the public key manually.');
console.log('Set the Supabase secret with:');
console.log('  supabase secrets set LICENSE_SIGNING_KEY="' + privatePkcs8B64.slice(0, 24) + '...(full value above)"');
console.log('============================================================\n');

module.exports = { privatePkcs8B64, publicSpkiB64 };
