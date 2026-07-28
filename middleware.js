/**
 * Vercel Edge Middleware — CSP Nonce Injection
 * ─────────────────────────────────────────────
 * Replaces 'unsafe-inline' in the Content-Security-Policy header with a
 * per-request cryptographic nonce, then rewrites the response body to
 * inject that nonce into every <script> tag that relies on inline execution.
 *
 * Uses the standard Vercel Edge Runtime API (no Next.js required).
 * See: https://vercel.com/docs/functions/edge-middleware/middleware-api
 */

/** Pages that contain inline scripts and need nonce injection. */
const HTML_PAGES = new Set([
  '/',
  '/login',
  '/dashboard',
  '/home',
  '/order',
  '/qr-order',
  '/bill',
  '/tokens',
  '/feedback',
  '/kds',
  '/status',
  '/pay',
  '/install',
  '/privacy',
  '/terms',
  '/refund-policy',
]);

/** Generates a cryptographically random 128-bit nonce, base64-encoded. */
function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Build a strict CSP string with the given nonce in place of 'unsafe-inline'.
 * The 'unsafe-inline' fallback for script-src is intentionally omitted;
 * older browsers that don't understand nonces will block inline scripts —
 * an acceptable trade-off for production security.
 *
 * NOTE: 'unsafe-inline' is kept in style-src because nonce-based style injection
 * is complex (CSS doesn't support nonces in all browsers uniformly), and
 * style injection attacks are significantly less severe than script injection.
 * Remove it from style-src in a future pass when all inline styles are extracted.
 */
function buildCSP(nonce) {
  return [
    'default-src \'self\'',
    'base-uri \'self\'',
    'object-src \'none\'',
    'frame-ancestors \'none\'',
    'form-action \'self\'',
    // Nonce replaces 'unsafe-inline'. Any legitimate inline <script> block
    // must receive the nonce attribute: <script nonce="${nonce}">
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://checkout.razorpay.com`,
    // Keep unsafe-inline for styles (see note above) — removes it from scripts is the key win.
    'style-src \'self\' \'unsafe-inline\' https://cdnjs.cloudflare.com https://fonts.googleapis.com',
    'font-src \'self\' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:',
    'img-src \'self\' data: blob: https:',
    'connect-src \'self\' https://*.supabase.co wss://*.supabase.co https://api.counterapi.dev https://cdnjs.cloudflare.com https://api.razorpay.com https://lumberjack.razorpay.com',
    'frame-src \'self\' https://api.razorpay.com https://checkout.razorpay.com',
    'media-src \'self\' data: blob:',
    'worker-src \'self\' blob:',
    'upgrade-insecure-requests',
  ].join('; ');
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  // Only inject nonces on HTML pages. Pass everything else through.
  const isHtmlPage = HTML_PAGES.has(pathname) || pathname === '/';
  if (!isHtmlPage) {
    // Standard Vercel middleware pass-through: return undefined so the
    // runtime proceeds to fetch the real origin asset. Returning a
    // Response object here would intercept the request.
    return undefined;
  }

  const nonce = generateNonce();
  const csp = buildCSP(nonce);

  // Fetch the actual HTML response from the origin.
  const response = await fetch(request);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const html = (await response.text()).replace(
    /<script(?![^>]*\bsrc\s*=)(?![^>]*\bnonce\s*=)([^>]*)>/gi,
    `<script nonce="${nonce}"$1>`
  );

  // Rebuild the headers, overwriting CSP and disabling caching (nonces must not be reused).
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', csp);
  headers.set('Cache-Control', 'no-store');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const config = {
  // Only run on HTML page routes, not on /api/*, /_next/*, /assets/*, etc.
  matcher: [
    '/((?!api|_next/static|_next/image|assets|images|favicon|service-worker|manifest|robots|sitemap).*)',
  ],
};
