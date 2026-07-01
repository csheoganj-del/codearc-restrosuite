import { createHash } from 'node:crypto';

export default async function handler(req, res) {
  const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || process.env.GATEWAY_URL || 'https://kalpeshdeora1006-restrosuite-gateway.hf.space').replace(/\/$/, '');
  const configuredToken = (process.env.WHATSAPP_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN || process.env.GATEWAY_AUTH_TOKEN || '').trim();
  const gatewayToken = configuredToken.toLowerCase().startsWith('bearer ') ? configuredToken.slice(7).trim() : configuredToken;
  const tokenFingerprint = gatewayToken ? createHash('sha256').update(gatewayToken).digest('hex').slice(0, 12) : null;

  if (!gatewayToken) {
    return res.status(503).json({ error: 'WhatsApp gateway token is not configured on the server.' });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${gatewayToken}`,
    'x-gateway-token': gatewayToken
  };

  async function readGatewayResponse(response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch { return { error: text || `Gateway error ${response.status}` }; }
  }

  if (req.method === 'GET') {
    try {
      const statusResp = await fetch(`${gatewayUrl}/status`, { method: 'GET', headers, cache: 'no-store' });
      const statusData = await readGatewayResponse(statusResp);

      // /status intentionally exposes connection state even without auth.
      // /send checks the real gateway token before validating body fields, so
      // an empty body should return 400 when authorized and 401 when rejected.
      const authResp = await fetch(`${gatewayUrl}/send`, {
        method: 'POST',
        headers,
        body: '{}'
      });
      const authData = await readGatewayResponse(authResp);
      const sendAuthorized = authResp.status !== 401;

      return res.status(sendAuthorized ? 200 : 401).json({
        ok: sendAuthorized && statusResp.ok,
        gatewayAuthorized: sendAuthorized,
        gatewayStatus: statusData.status || null,
        gatewayAuthenticated: Boolean(statusData.authenticated),
        sendAuthStatus: authResp.status,
        tokenFingerprint,
        error: sendAuthorized ? undefined : 'Gateway /send rejected the token. Set GATEWAY_TOKEN in Hugging Face Space secrets and restart the Space.',
        gatewayError: sendAuthorized ? undefined : (authData.error || authData.status || null)
      });
    } catch (err) {
      return res.status(502).json({
        ok: false,
        gatewayAuthorized: false,
        error: `Gateway status check failed: ${err.message}`,
        tokenFingerprint
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, items, country, pdfData, filename } = req.body || {};
  if (!phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing phone number or cart items' });
  }

  const CONFIGS = {
    IN: { sym: 'Rs ', dial: '91', taxLabel: 'GST', taxMode: 'cgst_sgst', taxRate: 5, sacCode: '9963' },
    IE: { sym: 'EUR ', dial: '353', taxLabel: 'VAT', taxMode: 'vat_breakout', taxRate: 9 },
    GB: { sym: 'GBP ', dial: '44', taxLabel: 'VAT', taxMode: 'vat_breakout', taxRate: 20 },
    US: { sym: '$', dial: '1', taxLabel: 'Tax', taxMode: 'sales_tax', taxRate: 8 },
    AU: { sym: 'A$', dial: '61', taxLabel: 'GST', taxMode: 'sales_tax', taxRate: 10 },
    CA: { sym: 'CA$', dial: '1', taxLabel: 'HST', taxMode: 'sales_tax', taxRate: 13 }
  };

  const cfg = CONFIGS[country] || CONFIGS.IN;
  const rs = n => cfg.sym + Math.round(Number(n || 0)).toLocaleString('en-IN');

  let cleanPhone = String(phone).replace(/\D/g, '');
  if (!cleanPhone.startsWith(cfg.dial)) cleanPhone = cfg.dial + cleanPhone;
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const billNo = `RS-${ymd}-${String(Math.floor(100 + Math.random() * 900)).padStart(3, '0')}`;
  const dateStr = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const tax = Math.round(subtotal * cfg.taxRate / 100);
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

  if (pdfData) {
    const cleanPdfData = String(pdfData).includes(',') ? String(pdfData).split(',').pop() : String(pdfData);
    const pdfResp = await fetch(`${gatewayUrl}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: cleanPhone,
        pdfData: cleanPdfData,
        filename: filename || `Receipt_${billNo}.pdf`,
        message: message
      })
    });
    const pdfRespData = await readGatewayResponse(pdfResp);
    if (!pdfResp.ok) {
      return res.status(pdfResp.status).json({
        error: pdfRespData.error || `PDF send failed with gateway status ${pdfResp.status}`,
        tokenFingerprint
      });
    }
    return res.status(200).json({ ok: true, phone: cleanPhone, billNo, textSent: false, pdfSent: true });
  }

  const textResp = await fetch(`${gatewayUrl}/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: cleanPhone, message })
  });
  const textData = await readGatewayResponse(textResp);
  if (!textResp.ok) {
    if (textResp.status === 401) {
      return res.status(401).json({
        error: 'Gateway /send rejected the token. Set GATEWAY_TOKEN in Hugging Face Space secrets, restart the Space, then redeploy Vercel if you changed Vercel too.',
        tokenFingerprint
      });
    }
    return res.status(textResp.status).json({ error: textData.error || `Gateway error ${textResp.status}` });
  }

  return res.status(200).json({ ok: true, phone: cleanPhone, billNo, textSent: true, pdfSent: false });
}
