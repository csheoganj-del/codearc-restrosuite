/**
 * GET /api/config
 * Serves public Supabase credentials from Vercel environment variables.
 * The anon key is intentionally public (it's safe to expose in the browser),
 * but keeping it out of source code prevents it being scraped from GitHub
 * and means rotation only requires an env-var update, not a code deploy.
 *
 * Required Vercel environment variables:
 *   SUPABASE_URL          — e.g. https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY     — the public anon/service key from Supabase → Settings → API
 */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[api/config] SUPABASE_URL or SUPABASE_ANON_KEY env vars are not set.');
    return res.status(503).json({ error: 'Service configuration is incomplete. Contact support.' });
  }

  // Short cache — safe to cache briefly since these values rarely change.
  // No-store would also be acceptable if you prefer freshness.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json');

  return res.status(200).json({ supabaseUrl, supabaseAnonKey });
}
