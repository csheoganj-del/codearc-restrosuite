import { createHash } from 'node:crypto';

/** Public-facing errors must never name vendors, hosts, or stack details. */
function publicErr(code, fallback) {
  const map = {
    not_configured: 'Messaging is not available right now. Please try again later.',
    unauthorized: 'Messaging is not available right now. Please try again later.',
    status_failed: 'Could not reach messaging service. Please try again.',
    not_linked: 'Messaging is offline — WhatsApp is not linked. Link it in the dashboard, then try again.',
    missing_body: 'Missing phone number or cart items',
    invalid_phone: 'Invalid phone number',
    send_failed: 'Could not send the bill. Please try again.',
    method: 'Method not allowed',
  };
  return map[code] || fallback || 'Something went wrong. Please try again.';
}

export default async function handler(req, res) {
  // Server-only config — never echoed to clients
  const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || process.env.GATEWAY_URL || '').replace(/\/$/, '');
  const configuredToken = (process.env.WHATSAPP_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN || process.env.GATEWAY_AUTH_TOKEN || '').trim();
  const gatewayToken = configuredToken.toLowerCase().startsWith('bearer ') ? configuredToken.slice(7).trim() : configuredToken;

  if (!gatewayUrl || !gatewayToken) {
    return res.status(503).json({ error: publicErr('not_configured') });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${gatewayToken}`,
    'x-gateway-token': gatewayToken,
  };

  async function readGatewayResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: text || 'upstream error' };
    }
  }

  if (req.method === 'GET') {
    // Health check for ops only — minimal public surface, no stack fingerprints
    try {
      const statusResp = await fetch(`${gatewayUrl}/status`, { method: 'GET', headers, cache: 'no-store' });
      const authResp = await fetch(`${gatewayUrl}/send`, {
        method: 'POST',
        headers,
        body: '{}',
      });
      const sendAuthorized = authResp.status !== 401;
      return res.status(sendAuthorized ? 200 : 401).json({
        ok: sendAuthorized && statusResp.ok,
        messagingReady: sendAuthorized && statusResp.ok,
      });
    } catch {
      return res.status(502).json({
        ok: false,
        messagingReady: false,
        error: publicErr('status_failed'),
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: publicErr('method') });
  }

  const { phone, items, country, pdfData, filename } = req.body || {};
  if (!phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: publicErr('missing_body') });
  }

  const CONFIGS = {
    IN: { sym: 'Rs ', dial: '91', taxLabel: 'GST', taxMode: 'cgst_sgst', taxRate: 5, sacCode: '9963' },
    IE: { sym: 'EUR ', dial: '353', taxLabel: 'VAT', taxMode: 'vat_breakout', taxRate: 9 },
    GB: { sym: 'GBP ', dial: '44', taxLabel: 'VAT', taxMode: 'vat_breakout', taxRate: 20 },
    US: { sym: '$', dial: '1', taxLabel: 'Tax', taxMode: 'sales_tax', taxRate: 8 },
    AU: { sym: 'A$', dial: '61', taxLabel: 'GST', taxMode: 'sales_tax', taxRate: 10 },
    CA: { sym: 'CA$', dial: '1', taxLabel: 'HST', taxMode: 'sales_tax', taxRate: 13 },
  };

  const cfg = CONFIGS[country] || CONFIGS.IN;
  const rs = (n) => cfg.sym + Math.round(Number(n || 0)).toLocaleString('en-IN');

  let cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone.startsWith(cfg.dial)) cleanPhone = cfg.dial + cleanPhone;
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return res.status(400).json({ error: publicErr('invalid_phone') });
  }

  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const billNo = `RS-${ymd}-${String(Math.floor(100 + Math.random() * 900)).padStart(3, '0')}`;
  const dateStr = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const tax = Math.round((subtotal * cfg.taxRate) / 100);
  const total = subtotal + tax;

  let message = `*RestroSuite Demo*\n`;
  message += `Phone: +${cleanPhone}\n`;
  message += `Bill: ${billNo}\n`;
  message += `${dateStr}\n\n`;
  for (const item of items) {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    message += `${qty} x ${item.name}    ${rs(qty * price)}\n`;
  }
  message += `\nSubtotal    ${rs(subtotal)}\n`;
  if (cfg.taxMode === 'cgst_sgst') {
    const half = Math.round(tax / 2);
    message += `CGST    ${rs(half)}\nSGST    ${rs(tax - half)}\nSAC: ${cfg.sacCode}\n`;
  } else {
    message += `${cfg.taxLabel} (${cfg.taxRate}%)    ${rs(tax)}\n`;
  }
  message += `\n*TOTAL    ${rs(total)}*\n\nThank you for dining with us.\nPowered by RestroSuite`;

  try {
    // Prefer a clear offline/not-linked message before attempting send
    try {
      const statusResp = await fetch(`${gatewayUrl}/status`, { method: 'GET', headers, cache: 'no-store' });
      if (statusResp.ok) {
        const st = await statusResp.json().catch(() => ({}));
        const status = String((st && st.status) || '').toLowerCase();
        if (status && status !== 'ready') {
          return res.status(503).json({ error: publicErr('not_linked'), code: 'not_linked' });
        }
      }
    } catch {
      /* fall through to send attempt */
    }

    if (pdfData) {
      const cleanPdfData = String(pdfData).includes(',') ? String(pdfData).split(',').pop() : String(pdfData);
      const pdfResp = await fetch(`${gatewayUrl}/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: cleanPhone,
          pdfData: cleanPdfData,
          filename: filename || `Receipt_${billNo}.pdf`,
          message,
        }),
      });
      if (!pdfResp.ok) {
        const body = await readGatewayResponse(pdfResp);
        const raw = String((body && (body.error || body.message || body.reason)) || '').toLowerCase();
        if (pdfResp.status === 401) {
          return res.status(503).json({ error: publicErr('unauthorized') });
        }
        if (/disconnect|not.?ready|offline|not.?link|session|logged.?out|qr/i.test(raw) || pdfResp.status === 409 || pdfResp.status === 503) {
          return res.status(503).json({ error: publicErr('not_linked'), code: 'not_linked' });
        }
        return res.status(502).json({ error: publicErr('send_failed') });
      }
      return res.status(200).json({ ok: true, phone: cleanPhone, billNo, textSent: false, pdfSent: true });
    }

    const textResp = await fetch(`${gatewayUrl}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: cleanPhone, message }),
    });
    if (!textResp.ok) {
      if (textResp.status === 401) {
        return res.status(503).json({ error: publicErr('unauthorized') });
      }
      const body = await readGatewayResponse(textResp);
      const raw = String((body && (body.error || body.message || body.reason)) || '').toLowerCase();
      if (/disconnect|not.?ready|offline|not.?link|session|logged.?out|qr/i.test(raw) || textResp.status === 409 || textResp.status === 503) {
        return res.status(503).json({ error: publicErr('not_linked'), code: 'not_linked' });
      }
      return res.status(502).json({ error: publicErr('send_failed') });
    }

    return res.status(200).json({ ok: true, phone: cleanPhone, billNo, textSent: true, pdfSent: false });
  } catch {
    return res.status(502).json({ error: publicErr('send_failed') });
  }
}
