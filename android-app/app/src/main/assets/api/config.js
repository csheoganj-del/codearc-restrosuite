/**
 * GET /api/config
 * Serves public runtime config from server environment variables.
 * Keys meant for the browser stay out of the git repo so rotation
 * only needs a host env update, not a code deploy.
 *
 * Required (host secrets only — never commit these):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *
 * Optional:
 *   ENABLE_DEMO_TOOLS     -- "true" to show demo tools (dev)
 *   ZERO_COST_LAUNCH_MODE -- "true" to disable cloud WhatsApp messaging
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Normalize bare project URL (no trailing /rest/v1 etc.)
  const supabaseUrl = (process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(rest|auth|storage|functions)\/v1$/, '')
    .replace(/\/+$/, '');
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[api/config] cloud URL or public key env vars are not set.');
    return res.status(503).json({ error: 'Service configuration is incomplete. Contact support.' });
  }

  const enableDemoTools = process.env.ENABLE_DEMO_TOOLS === 'true';
  const zeroCostLaunchMode = process.env.ZERO_COST_LAUNCH_MODE === 'true';

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json');

  return res.status(200).json({ supabaseUrl, supabaseAnonKey, enableDemoTools, zeroCostLaunchMode });
}
