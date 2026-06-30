export default async function handler(req, res) {
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

  const gatewayUrl = (process.env.WHATSAPP_GATEWAY_URL || process.env.GATEWAY_URL || 'https://kalpeshdeora1006-whatsapp-gateway.hf.space').replace(/\/$/, '');
  const gatewayToken = process.env.WHATSAPP_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN || process.env.GATEWAY_AUTH_TOKEN || '';
  if (!gatewayToken) {
    return res.status(503).json({ error: 'WhatsApp gateway token is not configured on the server.' });
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: gatewayToken.toLowerCase().startsWith('bearer ') ? gatewayToken : `Bearer ${gatewayToken}`
  };

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

  async function readGatewayResponse(response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch { return { error: text || `Gateway error ${response.status}` }; }
  }

  const textResp = await fetch(`${gatewayUrl}/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: cleanPhone, message })
  });
  const textData = await readGatewayResponse(textResp);
  if (!textResp.ok) {
    return res.status(textResp.status).json({ error: textData.error || `Gateway error ${textResp.status}` });
  }

  let pdfSent = false;
  if (pdfData) {
    const pdfResp = await fetch(`${gatewayUrl}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: cleanPhone,
        pdfData,
        filename: filename || `Receipt_${billNo}.pdf`
      })
    });
    pdfSent = pdfResp.ok;
  }

  return res.status(200).json({ ok: true, phone: cleanPhone, billNo, textSent: true, pdfSent });
}
