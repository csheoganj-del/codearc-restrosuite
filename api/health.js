/**
 * GET /api/health — public launch health (no secrets).
 * Used by status page + automated launch checks.
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(rest|auth|storage|functions)\/v1$/, '');
  const hasAnon = !!(process.env.SUPABASE_ANON_KEY || '').trim();
  const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || process.env.GATEWAY_URL || '').trim();
  const hasGatewayToken = !!(process.env.WHATSAPP_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN || process.env.GATEWAY_AUTH_TOKEN || '').trim();

  const checks = {
    api: true,
    supabaseConfigured: !!(supabaseUrl && hasAnon),
    whatsappGatewayConfigured: !!(gatewayUrl && hasGatewayToken),
    zeroCostLaunchMode: process.env.ZERO_COST_LAUNCH_MODE === 'true',
    demoTools: process.env.ENABLE_DEMO_TOOLS === 'true',
  };

  const ok = checks.api && checks.supabaseConfigured;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(ok ? 200 : 503).json({
    ok,
    service: 'restrosuite',
    time: new Date().toISOString(),
    checks,
    downloads: {
      windowsSetup: 'https://github.com/csheoganj-del/restrosuite-downloads/releases/download/v2.0.25/RestroSuite-Windows-Setup.exe',
      android: 'https://restrosuite.codearc.co.in/downloads/RestroSuite-Android.apk',
      releasePage: 'https://github.com/csheoganj-del/restrosuite-downloads/releases/tag/v2.0.25',
    },
    support: 'support@codearc.co.in',
    site: 'https://restrosuite.codearc.co.in',
  });
}
